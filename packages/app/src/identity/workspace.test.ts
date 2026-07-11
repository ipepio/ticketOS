import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresIdentity } from './postgres.js';
import { PostgresWorkspace } from '../workspace/postgres.js';
import { PostgresOutbox } from '../db/outbox.js';
import { PostgresAudit } from '../db/audit.js';
import type { DomainEvent } from '@ticketos/domain';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('installation-admin', 'workspace-admin', 'agent', 'requester')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
  )`,

  `CREATE TABLE IF NOT EXISTS queue_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, queue_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    access_mode TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open', 'restricted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    actor_user_id UUID,
    workspace_id UUID,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Identity + Workspace integration', () => {
  let pool: Pool;
  let identity: PostgresIdentity;
  let workspace: PostgresWorkspace;
  let outbox: PostgresOutbox;
  let audit: PostgresAudit;
  let userId: string;
  let wsId: string;

  beforeEach(async () => {
    pool = createTestPool();
    // Ensure all tables exist
    for (const sql of MIGRATIONS) {
      await pool.query(sql);
    }
    // Clean slate (order matters for FK)
    await pool.query('DELETE FROM magic_links');
    await pool.query('DELETE FROM queue_members');
    await pool.query('DELETE FROM workspace_memberships');
    await pool.query('DELETE FROM queues');
    await pool.query('DELETE FROM organizations');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');
    await pool.query('DELETE FROM audit_events');

    // Create test user and workspace
    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email, verified_at) VALUES ($1, $2, NOW()) RETURNING id',
      [crypto.randomUUID(), 'test@example.com'],
    );
    userId = userRows[0]!.id;
    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Test'],
    );
    wsId = wsRows[0]!.id;

    outbox = new PostgresOutbox(pool);
    audit = new PostgresAudit(pool);
    identity = new PostgresIdentity(pool, outbox, audit);
    workspace = new PostgresWorkspace(pool);
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Magic link', () => {
    it('rejects an already-used magic link', async () => {
      const result = await identity.requestMagicLink('used@example.com', wsId);
      await identity.verifyMagicLink(result.token);
      const second = await identity.verifyMagicLink(result.token);
      expect(second).toBeNull();
    });
  });

  describe('Workspace and membership', () => {
    it('creates a workspace', async () => {
      const ws = await workspace.createWorkspace({ name: 'Test Workspace' });
      expect(ws.name).toBe('Test Workspace');
      expect(ws.id).toBeDefined();
    });

    it('returns empty capabilities for a user with no membership', async () => {
      const caps = await identity.getCapabilities(userId, wsId);
      expect(caps).toEqual([]);
    });

    it('checks capability returns false for unauthorized user', async () => {
      await workspace.createWorkspace({ name: 'Check WS' });
      const has = await identity.hasCapability(
        crypto.randomUUID(),
        wsId,
        'tickets:create',
      );
      expect(has).toBe(false);
    });
  });

  describe('Queue access control', () => {
    it('creates a restricted queue', async () => {
      const ws = await workspace.createWorkspace({ name: 'Queue WS' });
      const queue = await workspace.createQueue({
        workspaceId: ws.id,
        name: 'Security Team',
        accessMode: 'restricted',
      });

      expect(queue.accessMode).toBe('restricted');
      expect(queue.workspaceId).toBe(ws.id);
    });

    it('manages queue members for a restricted queue', async () => {
      const ws = await workspace.createWorkspace({ name: 'Member WS' });
      const queue = await workspace.createQueue({
        workspaceId: ws.id,
        name: 'Team',
        accessMode: 'restricted',
      });

      await workspace.addQueueMember({
        workspaceId: ws.id,
        queueId: queue.id,
        userId,
      });

      const isMember = await workspace.isQueueMember(queue.id, userId);
      expect(isMember).toBe(true);

      const notMember = await workspace.isQueueMember(queue.id, crypto.randomUUID());
      expect(notMember).toBe(false);
    });

    it('removes a queue member', async () => {
      const ws = await workspace.createWorkspace({ name: 'Remove WS' });
      const queue = await workspace.createQueue({
        workspaceId: ws.id,
        name: 'Team',
        accessMode: 'restricted',
      });

      await workspace.addQueueMember({
        workspaceId: ws.id,
        queueId: queue.id,
        userId,
      });

      await workspace.removeQueueMember(ws.id, queue.id, userId);

      const isMember = await workspace.isQueueMember(queue.id, userId);
      expect(isMember).toBe(false);
    });
  });

  describe('Outbox integration', () => {
    it('enqueues events', async () => {
      const event: DomainEvent = {
        aggregateId: 'ws-test',
        eventType: 'workspace.created',
        data: { name: 'Test' },
      };

      await outbox.enqueue(event);
      const available = await outbox.fetchAvailable();
      expect(available.length).toBeGreaterThanOrEqual(1);
    });
  });
});
