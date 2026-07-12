import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresIntegration } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS service_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, token_prefix TEXT NOT NULL, token_hash TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, token_prefix)
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    status_code INTEGER, response TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Integration Module', () => {
  let pool: Pool;
  let integration: PostgresIntegration;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM webhook_deliveries');
    await pool.query('DELETE FROM webhooks');
    await pool.query('DELETE FROM service_tokens');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    integration = new PostgresIntegration(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Integration Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'int-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Service Tokens', () => {
    it('creates a service token with raw token', async () => {
      const { token, rawToken } = await integration.createServiceToken({
        workspaceId,
        name: 'CI Token',
        capabilities: ['tickets:read', 'tickets:create'],
        createdBy: userId,
      });

      expect(token.id).toBeDefined();
      expect(token.name).toBe('CI Token');
      expect(token.status).toBe('active');
      expect(rawToken).toMatch(/^tkt_/);
      expect(token.tokenPrefix).toBe(rawToken.substring(0, 11));
    });

    it('validates a service token', async () => {
      const { rawToken } = await integration.createServiceToken({
        workspaceId,
        name: 'Valid Token',
        capabilities: ['tickets:read'],
        createdBy: userId,
      });

      const result = await integration.validateServiceToken(rawToken);
      expect(result).not.toBeNull();
      expect(result!.workspaceId).toBe(workspaceId);
    });

    it('rejects an invalid token', async () => {
      const result = await integration.validateServiceToken('tkt_invalid');
      expect(result).toBeNull();
    });

    it('revokes a service token', async () => {
      const { token } = await integration.createServiceToken({
        workspaceId,
        name: 'Revoke Me',
        capabilities: ['tickets:read'],
        createdBy: userId,
      });

      await integration.revokeServiceToken(token.id);
      const found = await integration.getServiceToken(token.id);
      expect(found!.status).toBe('revoked');
    });

    it('lists service tokens for a workspace', async () => {
      await integration.createServiceToken({
        workspaceId,
        name: 'Token A',
        capabilities: ['tickets:read'],
        createdBy: userId,
      });
      await integration.createServiceToken({
        workspaceId,
        name: 'Token B',
        capabilities: ['tickets:read'],
        createdBy: userId,
      });

      const tokens = await integration.listServiceTokens(workspaceId);
      expect(tokens).toHaveLength(2);
    });
  });

  describe('Webhooks', () => {
    it('creates a webhook with auto-generated secret', async () => {
      const webhook = await integration.createWebhook({
        workspaceId,
        name: 'Slack Hook',
        url: 'https://hooks.slack.com/xxx',
        events: ['ticket-created', 'ticket-updated'],
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.name).toBe('Slack Hook');
      expect(webhook.secret).toHaveLength(64); // 32 bytes hex
      expect(webhook.events).toHaveLength(2);
    });

    it('updates a webhook', async () => {
      const webhook = await integration.createWebhook({
        workspaceId,
        name: 'Original',
        url: 'https://example.com/hook',
        events: ['ticket-created'],
      });

      const updated = await integration.updateWebhook(webhook.id, {
        name: 'Updated',
        events: ['ticket-created', 'ticket-updated'],
      });
      expect(updated.name).toBe('Updated');
      expect(updated.events).toHaveLength(2);
    });

    it('deletes a webhook', async () => {
      const webhook = await integration.createWebhook({
        workspaceId,
        name: 'Delete Me',
        url: 'https://example.com/hook',
        events: [],
      });
      await integration.deleteWebhook(webhook.id);
      const found = await integration.getWebhook(webhook.id);
      expect(found).toBeNull();
    });

    it('lists webhooks for a workspace', async () => {
      await integration.createWebhook({
        workspaceId,
        name: 'Hook A',
        url: 'https://a.com',
        events: [],
      });
      await integration.createWebhook({
        workspaceId,
        name: 'Hook B',
        url: 'https://b.com',
        events: [],
      });

      const hooks = await integration.listWebhooks(workspaceId);
      expect(hooks).toHaveLength(2);
    });
  });

  describe('Webhook Delivery', () => {
    it('creates a delivery record', async () => {
      const webhook = await integration.createWebhook({
        workspaceId,
        name: 'Delivery Test',
        url: 'https://example.com/hook',
        events: ['ticket-created'],
      });

      const delivery = await integration.deliverWebhook({
        webhookId: webhook.id,
        eventType: 'ticket-created',
        payload: { ticketId: '123', title: 'Test' },
      });

      expect(delivery.id).toBeDefined();
      expect(delivery.status).toBe('success');
      expect(delivery.eventType).toBe('ticket-created');
    });

    it('retries a failed delivery', async () => {
      const webhook = await integration.createWebhook({
        workspaceId,
        name: 'Retry Test',
        url: 'https://example.com/hook',
        events: ['ticket-created'],
      });

      const delivery = await integration.deliverWebhook({
        webhookId: webhook.id,
        eventType: 'ticket-created',
        payload: { test: true },
      });

      const retried = await integration.retryDelivery(delivery.id);
      expect(retried.attempts).toBe(2); // was 1 from deliverWebhook, +1 from retry
      expect(retried.status).toBe('pending');
    });
  });

  describe('Signature', () => {
    it('signs and verifies a payload', () => {
      const payload = JSON.stringify({ event: 'ticket-created' });
      const secret = 'webhook-secret-123';

      const signature = integration.signPayload(payload, secret);
      expect(signature).toHaveLength(64); // SHA-256 hex

      const valid = integration.verifySignature(payload, signature, secret);
      expect(valid).toBe(true);

      const invalid = integration.verifySignature(payload, 'wrong-sig', secret);
      expect(invalid).toBe(false);
    });
  });
});
