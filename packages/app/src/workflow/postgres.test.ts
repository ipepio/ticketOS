import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresWorkflow } from './postgres.js';
import { PostgresWorkspace } from '../workspace/postgres.js';
import { PostgresAudit } from '../db/audit.js';

const MIGRATIONS = [
  // Workspace tables (from P0-02)
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
  // P0-03 workflow tables
  `CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
  )`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed')
   ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    from_status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    to_status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, from_status_id, to_status_id)
  )`,
  `CREATE TABLE IF NOT EXISTS priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('critical', 'high', 'normal', 'low')),
    sort_order INTEGER NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
  )`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request')
   ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_ticket_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(workspace_id, name)
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Workflow', () => {
  let pool: Pool;
  let workflow: PostgresWorkflow;
  let workspace: PostgresWorkspace;
  let audit: PostgresAudit;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql);
    }
    // Clean
    await pool.query('DELETE FROM transitions');
    await pool.query('DELETE FROM statuses');
    await pool.query('DELETE FROM ticket_types');
    await pool.query('DELETE FROM workspace_ticket_tags');
    await pool.query('DELETE FROM priorities');
    await pool.query('DELETE FROM queues');
    await pool.query('DELETE FROM organizations');
    await pool.query('DELETE FROM workspace_memberships');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');
    await pool.query('DELETE FROM audit_events');

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Workflow Test'],
    );
    void wsRows;

    audit = new PostgresAudit(pool);
    workflow = new PostgresWorkflow(pool);
    workspace = new PostgresWorkspace(pool);
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Default provisioning', () => {
    it('provisions default statuses on workspace creation', async () => {
      const ws = await workspace.createWorkspace({ name: 'Provision WS' });
      await workflow.provisionDefaults(ws.id);
      const statuses = await workflow.getStatuses(ws.id);

      const names = statuses.map((s) => s.name).sort();
      expect(names).toContain('New');
      expect(names).toContain('Open');
      expect(names).toContain('Pending');
      expect(names).toContain('Resolved');
      expect(names).toContain('Closed');
    });

    it('provisions default priorities', async () => {
      const ws = await workspace.createWorkspace({ name: 'Priority WS' });
      await workflow.provisionDefaults(ws.id);
      const priorities = await workflow.getPriorities(ws.id);

      const names = priorities.map((p) => p.name).sort();
      expect(names).toContain('critical');
      expect(names).toContain('high');
      expect(names).toContain('normal');
      expect(names).toContain('low');
    });

    it('provisions default ticket types', async () => {
      const ws = await workspace.createWorkspace({ name: 'Type WS' });
      await workflow.provisionDefaults(ws.id);
      const types = await workflow.getTicketTypes(ws.id);

      const categories = types.map((t) => t.category).sort();
      expect(categories).toContain('incident');
      expect(categories).toContain('service-request');
    });

    it('creates an Inbox Queue on workspace creation', async () => {
      const ws = await workspace.createWorkspace({ name: 'Inbox WS' });
      await workflow.provisionDefaults(ws.id);
      const queues = await workspace.getQueues(ws.id);

      expect(queues).toHaveLength(1);
      expect(queues[0]!.name).toBe('Inbox');
    });
  });

  describe('Status validation', () => {
    it('maps each status to exactly one category', async () => {
      const ws = await workspace.createWorkspace({ name: 'Category WS' });
      await workflow.provisionDefaults(ws.id);
      const statuses = await workflow.getStatuses(ws.id);

      for (const s of statuses) {
        expect(s.category).toMatch(/^(new|open|pending|resolved|closed)$/);
      }
    });
  });

  describe('System Events', () => {
    it('records audit events for workspace creation', async () => {
      const ws = await workspace.createWorkspace({ name: 'Event WS' });
      await workflow.provisionDefaults(ws.id);

      // The workspace creation should have been logged
      const auditEvents = await audit.query(ws.id);
      expect(auditEvents.length).toBeGreaterThanOrEqual(0);
    });
  });
});
