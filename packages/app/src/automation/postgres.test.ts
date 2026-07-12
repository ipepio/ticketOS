import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresAutomation } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, access_mode TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
  )`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
  )`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal',
    ticket_type_id UUID, created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    event TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS automation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    causal_chain_id UUID NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'skipped', 'loop-blocked')),
    result TEXT, error TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Automation Module', () => {
  let pool: Pool;
  let automation: PostgresAutomation;
  let workspaceId: string;
  let userId: string;
  let ticketId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM automation_executions');
    await pool.query('DELETE FROM automation_rules');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    automation = new PostgresAutomation(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Automation Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'auto-test@test.com'],
    );
    userId = userRows[0]!.id;

    const { rows: ticketRows } = await pool.query(
      'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
      [workspaceId, 'Test Ticket', userId],
    );
    ticketId = ticketRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Rules CRUD', () => {
    it('creates an automation rule', async () => {
      const rule = await automation.createRule({
        workspaceId,
        name: 'Auto-assign critical',
        event: 'ticket-created',
        conditions: [{ field: 'priority', operator: 'equals', value: 'critical' }],
        actions: [{ type: 'set-status', params: { status: 'in_progress' } }],
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Auto-assign critical');
      expect(rule.status).toBe('active');
      expect(rule.conditions).toHaveLength(1);
      expect(rule.actions).toHaveLength(1);
    });

    it('lists rules for a workspace', async () => {
      await automation.createRule({
        workspaceId,
        name: 'Rule A',
        event: 'ticket-created',
        conditions: [],
        actions: [{ type: 'add-tag', params: { tag: 'auto' } }],
      });
      await automation.createRule({
        workspaceId,
        name: 'Rule B',
        event: 'ticket-updated',
        conditions: [],
        actions: [{ type: 'send-notification', params: {} }],
      });

      const rules = await automation.listRules(workspaceId);
      expect(rules).toHaveLength(2);
    });

    it('updates a rule', async () => {
      const rule = await automation.createRule({
        workspaceId,
        name: 'Original',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });

      const updated = await automation.updateRule(rule.id, {
        name: 'Updated',
        status: 'paused',
      });
      expect(updated.name).toBe('Updated');
      expect(updated.status).toBe('paused');
    });

    it('deletes a rule', async () => {
      const rule = await automation.createRule({
        workspaceId,
        name: 'Delete Me',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });
      await automation.deleteRule(rule.id);
      const found = await automation.getRule(rule.id);
      expect(found).toBeNull();
    });
  });

  describe('Rule evaluation', () => {
    it('lists active rules for a specific event', async () => {
      await automation.createRule({
        workspaceId,
        name: 'On Create',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });
      await automation.createRule({
        workspaceId,
        name: 'On Update',
        event: 'ticket-updated',
        conditions: [],
        actions: [],
      });
      await automation.createRule({
        workspaceId,
        name: 'Paused Rule',
        event: 'ticket-created',
        conditions: [],
        actions: [],
        sortOrder: 0,
      });
      await automation.updateRule(
        (await automation.listRules(workspaceId))[2]!.id,
        { status: 'paused' },
      );

      const active = await automation.listActiveRules(workspaceId, 'ticket-created');
      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe('On Create');
    });

    it('evaluates and executes matching rules', async () => {
      await automation.createRule({
        workspaceId,
        name: 'Tag new tickets',
        event: 'ticket-created',
        conditions: [],
        actions: [{ type: 'add-tag', params: { tag: 'new' } }],
      });

      const executions = await automation.evaluateAndExecute(
        workspaceId,
        'ticket-created',
        ticketId,
      );
      expect(executions).toHaveLength(1);
      expect(executions[0]!.status).toBe('success');
    });

    it('skips rules that already executed in the same causal chain', async () => {
      await automation.createRule({
        workspaceId,
        name: 'Tag once',
        event: 'ticket-created',
        conditions: [],
        actions: [{ type: 'add-tag', params: { tag: 'once' } }],
      });

      const chainId = crypto.randomUUID();
      await automation.evaluateAndExecute(workspaceId, 'ticket-created', ticketId, chainId);
      const second = await automation.evaluateAndExecute(workspaceId, 'ticket-created', ticketId, chainId);

      expect(second).toHaveLength(1);
      expect(second[0]!.status).toBe('skipped');
      expect(second[0]!.result).toContain('already executed');
    });

    it('blocks cascades exceeding max depth', async () => {
      await automation.createRule({
        workspaceId,
        name: 'Deep rule',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });

      const executions = await automation.evaluateAndExecute(
        workspaceId,
        'ticket-created',
        ticketId,
        ticketId,
        10, // at max depth
      );
      expect(executions).toHaveLength(1);
      expect(executions[0]!.status).toBe('loop-blocked');
    });
  });

  describe('Execution log', () => {
    it('records executions for a ticket', async () => {
      await automation.createRule({
        workspaceId,
        name: 'Log test',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });

      await automation.evaluateAndExecute(workspaceId, 'ticket-created', ticketId);
      const logs = await automation.getExecutionsForTicket(ticketId);
      expect(logs).toHaveLength(1);
    });

    it('records executions for a rule', async () => {
      const rule = await automation.createRule({
        workspaceId,
        name: 'Rule log',
        event: 'ticket-created',
        conditions: [],
        actions: [],
      });

      await automation.evaluateAndExecute(workspaceId, 'ticket-created', ticketId);
      const logs = await automation.getExecutionsForRule(rule.id);
      expect(logs).toHaveLength(1);
    });
  });
});
