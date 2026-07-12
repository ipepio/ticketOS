import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresRetention } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ, retention_policy_id UUID
  )`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retention_policy_id UUID`,
  `CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target TEXT NOT NULL CHECK (target IN ('tickets', 'timeline', 'attachments', 'articles')),
    retention_days INTEGER NOT NULL DEFAULT 365,
    archive_before_delete BOOLEAN NOT NULL DEFAULT true,
    anonymize_content BOOLEAN NOT NULL DEFAULT true,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    applied_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ, released_by UUID REFERENCES users(id) ON DELETE SET NULL
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Retention Module', () => {
  let pool: Pool;
  let retention: PostgresRetention;
  let workspaceId: string;
  let userId: string;
  let ticketId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM legal_holds');
    await pool.query('DELETE FROM retention_policies');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    retention = new PostgresRetention(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Retention Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'retention-test@test.com'],
    );
    userId = userRows[0]!.id;

    const { rows: ticketRows } = await pool.query(
      'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
      [workspaceId, 'Retention Ticket', userId],
    );
    ticketId = ticketRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Retention Policies', () => {
    it('creates a retention policy', async () => {
      const policy = await retention.createPolicy({
        workspaceId,
        name: 'Ticket Retention',
        target: 'tickets',
        retentionDays: 365,
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('Ticket Retention');
      expect(policy.retentionDays).toBe(365);
    });

    it('updates a retention policy', async () => {
      const policy = await retention.createPolicy({
        workspaceId,
        name: 'Original',
        target: 'tickets',
        retentionDays: 365,
      });

      const updated = await retention.updatePolicy(policy.id, {
        retentionDays: 730,
      });
      expect(updated.retentionDays).toBe(730);
    });

    it('lists policies for a workspace', async () => {
      await retention.createPolicy({
        workspaceId,
        name: 'Policy A',
        target: 'tickets',
        retentionDays: 365,
      });
      await retention.createPolicy({
        workspaceId,
        name: 'Policy B',
        target: 'timeline',
        retentionDays: 180,
      });

      const policies = await retention.listPolicies(workspaceId);
      expect(policies).toHaveLength(2);
    });
  });

  describe('Legal Holds', () => {
    it('applies a legal hold to a ticket', async () => {
      const hold = await retention.applyLegalHold({
        ticketId,
        workspaceId,
        reason: 'Legal investigation',
        appliedBy: userId,
      });

      expect(hold.id).toBeDefined();
      expect(hold.status).toBe('active');
      expect(hold.reason).toBe('Legal investigation');
    });

    it('releases a legal hold', async () => {
      const hold = await retention.applyLegalHold({
        ticketId,
        workspaceId,
        reason: 'Investigation',
        appliedBy: userId,
      });

      const released = await retention.releaseLegalHold(hold.id, userId);
      expect(released.status).toBe('released');
      expect(released.releasedAt).not.toBeNull();
    });

    it('checks if a ticket is on hold', async () => {
      const onHold = await retention.isTicketOnHold(ticketId);
      expect(onHold).toBe(false);

      await retention.applyLegalHold({
        ticketId,
        workspaceId,
        reason: 'Hold',
        appliedBy: userId,
      });

      const isOnHold = await retention.isTicketOnHold(ticketId);
      expect(isOnHold).toBe(true);
    });

    it('returns active holds for a ticket', async () => {
      await retention.applyLegalHold({
        ticketId,
        workspaceId,
        reason: 'Hold 1',
        appliedBy: userId,
      });
      await retention.applyLegalHold({
        ticketId,
        workspaceId,
        reason: 'Hold 2',
        appliedBy: userId,
      });

      const holds = await retention.getActiveHoldsForTicket(ticketId);
      expect(holds).toHaveLength(2);
    });
  });

  describe('Retention execution', () => {
    it('archives a ticket', async () => {
      await retention.archiveTicket(ticketId);
      const ticket = await pool.query('SELECT archived_at FROM tickets WHERE id = $1', [ticketId]);
      expect(ticket.rows[0]!.archived_at).not.toBeNull();
    });

    it('anonymizes a ticket', async () => {
      await retention.anonymizeTicket(ticketId);
      const ticket = await pool.query('SELECT title, description FROM tickets WHERE id = $1', [ticketId]);
      expect(ticket.rows[0]!.title).toBe('Anonymized');
      expect(ticket.rows[0]!.description).toBeNull();
    });

    it('deletes a ticket', async () => {
      await retention.deleteTicket(ticketId);
      const ticket = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
      expect(ticket.rows).toHaveLength(0);
    });
  });
});
