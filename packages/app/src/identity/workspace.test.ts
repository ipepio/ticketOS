import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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
  `CREATE TABLE IF NOT EXISTS oidc_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT 'openid email profile',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_oidc_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    oidc_provider_id UUID NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, oidc_provider_id)
  )`,
  `CREATE TABLE IF NOT EXISTS oidc_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_issuer TEXT NOT NULL REFERENCES oidc_providers(issuer) ON DELETE CASCADE,
    provider_subject TEXT NOT NULL,
    email TEXT,
    UNIQUE(provider_issuer, provider_subject)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
];

let pool: Pool | null = null;

describe('Identity + Workspace integration', () => {
  let identity: PostgresIdentity;
  let workspace: PostgresWorkspace;
  let outbox: PostgresOutbox;
  let audit: PostgresAudit;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
    });
    for (const sql of MIGRATIONS) {
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    await pool!.query('BEGIN');
    // Clean all data (inside transaction)
    await pool!.query('DELETE FROM magic_links');
    await pool!.query('DELETE FROM queue_members');
    await pool!.query('DELETE FROM workspace_memberships');
    await pool!.query('DELETE FROM queues');
    await pool!.query('DELETE FROM organizations');
    await pool!.query('DELETE FROM oidc_accounts');
    await pool!.query('DELETE FROM sessions');
    await pool!.query('DELETE FROM timeline_entries');
    await pool!.query('DELETE FROM ticket_followers');
    await pool!.query('DELETE FROM ticket_tags');
    await pool!.query('DELETE FROM tickets');
    await pool!.query('DELETE FROM users');
    await pool!.query('DELETE FROM workspaces');
    await pool!.query('DELETE FROM audit_events');

    outbox = new PostgresOutbox(pool!);
    audit = new PostgresAudit(pool!);
    identity = new PostgresIdentity(pool!, outbox, audit);
    workspace = new PostgresWorkspace(pool!);
  });

  afterEach(async () => {
    await pool!.query('ROLLBACK');
  });

  afterAll(async () => {
    await pool!.end();
  });

  describe('Magic link', () => {
    it('creates an unverified user when requesting a magic link', async () => {
      const ws = await workspace.createWorkspace({ name: 'Magic WS' });
      const result = await identity.requestMagicLink('new@example.com', ws.id);
      expect(result.token).toBeDefined();

      const { rows } = await pool!.query('SELECT * FROM users WHERE email = $1', ['new@example.com']);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.verified_at).toBeNull();
    });

    it('does not create a second user for the same email', async () => {
      const ws = await workspace.createWorkspace({ name: 'Dup WS' });
      await identity.requestMagicLink('existing@example.com', ws.id);
      await identity.requestMagicLink('existing@example.com', ws.id);

      const { rows } = await pool!.query('SELECT * FROM users WHERE email = $1', ['existing@example.com']);
      expect(rows).toHaveLength(1);
    });

    it('verifies a valid magic link and returns authenticated result', async () => {
      const ws = await workspace.createWorkspace({ name: 'Verify WS' });
      const result = await identity.requestMagicLink('verify@example.com', ws.id);
      const auth = await identity.verifyMagicLink(result.token);
      expect(auth).not.toBeNull();
      expect(auth!.userId).toBeDefined();
      expect(auth!.workspaceId).toBe(ws.id);
    });

    it('rejects an already-used magic link', async () => {
      const ws = await workspace.createWorkspace({ name: 'Used WS' });
      const result = await identity.requestMagicLink('used@example.com', ws.id);
      await identity.verifyMagicLink(result.token);
      const second = await identity.verifyMagicLink(result.token);
      expect(second).toBeNull();
    });

    it('rejects an expired magic link', async () => {
      const ws = await workspace.createWorkspace({ name: 'Expired WS' });
      const testUserId = crypto.randomUUID();
      await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2)',
        [testUserId, 'expired@example.com'],
      );
      const tokenHash = 'expired-hash';
      await pool!.query(
        `INSERT INTO magic_links (user_id, token_hash, workspace_id, expires_at, created_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours')`,
        [testUserId, tokenHash, ws.id],
      );

      const auth = await identity.verifyMagicLink(tokenHash);
      expect(auth).toBeNull();
    });
  });

  describe('Workspace and membership', () => {
    it('creates a workspace', async () => {
      const ws = await workspace.createWorkspace({ name: 'Test Workspace' });
      expect(ws.name).toBe('Test Workspace');
      expect(ws.id).toBeDefined();
    });

    it('creates a workspace-admin membership with correct capabilities', async () => {
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'admin@example.com'],
      );
      const adminUserId = userRows[0]!.id;

      const ws = await workspace.createWorkspace({ name: 'Admin WS' });
      const membership = await identity.createMembership({
        userId: adminUserId,
        workspaceId: ws.id,
        role: 'workspace-admin',
      });

      expect(membership.role).toBe('workspace-admin');
      expect(membership.capabilities).toContain('workspaces:manage');
      expect(membership.capabilities).toContain('tickets:create');
    });

    it('returns correct capabilities for a requester', async () => {
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'requester@example.com'],
      );
      const reqUserId = userRows[0]!.id;

      const ws = await workspace.createWorkspace({ name: 'Requester WS' });
      await identity.createMembership({
        userId: reqUserId,
        workspaceId: ws.id,
        role: 'requester',
      });

      const caps = await identity.getCapabilities(reqUserId, ws.id);
      expect(caps).toContain('tickets:create');
      expect(caps).not.toContain('queues:manage');
    });

    it('returns empty capabilities for a user with no membership', async () => {
      const ws = await workspace.createWorkspace({ name: 'Empty WS' });
      const caps = await identity.getCapabilities(crypto.randomUUID(), ws.id);
      expect(caps).toEqual([]);
    });

    it('checks capability returns false for unauthorized user', async () => {
      await workspace.createWorkspace({ name: 'Check WS' });
      const has = await identity.hasCapability(
        crypto.randomUUID(),
        crypto.randomUUID(),
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

      // Create user first (FK requires it)
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'member@example.com'],
      );
      const testUserId = userRows[0]!.id;

      await workspace.addQueueMember({
        workspaceId: ws.id,
        queueId: queue.id,
        userId: testUserId,
      });

      const isMember = await workspace.isQueueMember(queue.id, testUserId);
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

      // Create user first (FK requires it)
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'remover@example.com'],
      );
      const testUserId = userRows[0]!.id;

      await workspace.addQueueMember({
        workspaceId: ws.id,
        queueId: queue.id,
        userId: testUserId,
      });

      await workspace.removeQueueMember(ws.id, queue.id, testUserId);

      const isMember = await workspace.isQueueMember(queue.id, testUserId);
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

  describe('Sessions', () => {
    it('creates and retrieves a session', async () => {
      const ws = await workspace.createWorkspace({ name: 'Session WS' });
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'session@example.com'],
      );
      const userId = userRows[0]!.id;

      const sessionId = await identity.createSession(userId, ws.id, { theme: 'dark' });
      expect(sessionId).toBeDefined();

      const session = await identity.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(userId);
      expect(session!.workspaceId).toBe(ws.id);
    });

    it('deletes a session', async () => {
      const ws = await workspace.createWorkspace({ name: 'Delete Session WS' });
      const { rows: userRows } = await pool!.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'delete-session@example.com'],
      );
      const userId = userRows[0]!.id;

      const sessionId = await identity.createSession(userId, ws.id);
      await identity.deleteSession(sessionId);

      const session = await identity.getSession(sessionId);
      expect(session).toBeNull();
    });
  });
});
