import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresTicket } from './postgres.js';

/**
 * Ticket creation contract (seam: TicketModule → PostgreSQL).
 *
 * These tests observe behavior only through the Ticket module interface.
 * They never query tables to verify results.
 */
describe('Ticket creation contract', () => {
  let pool: Pool;
  let ticket: PostgresTicket;
  let workspaceId: string;
  let userId: string;
  let ticketTypeId: string;
  let priorityId: string;
  let otherTicketTypeId: string;
  let otherPriorityId: string;
  let inactiveTicketTypeId: string;
  let inactivePriorityId: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://ticketos:ticketos@localhost:5432/ticketos',
    });
    // The shared test database already carries the real migration schema.
    // These statements are idempotent so the file is self-contained.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_type_categories (
        name TEXT PRIMARY KEY
      );
    `);
    await pool.query(`
      INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request')
      ON CONFLICT DO NOTHING
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, name)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS priorities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, name)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'normal',
        ticket_type_id UUID,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        cancelled_at TIMESTAMPTZ,
        cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        priority_id UUID
      );
    `);
    await pool.query(`
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority_id UUID
    `);
    await pool.query(`
      ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
    `);
    await pool.query(`
      ALTER TABLE priorities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
    `);
  });

  beforeEach(async () => {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM timeline_entries');
    await pool.query('DELETE FROM ticket_followers');
    await pool.query('DELETE FROM ticket_tags');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM ticket_types');
    await pool.query('DELETE FROM priorities');
    await pool.query('DELETE FROM workspace_memberships');
    await pool.query('DELETE FROM organizations');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    const { rows: ws } = await pool.query(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      ['Creation Contract Workspace'],
    );
    workspaceId = ws[0]!.id;
    const { rows: u } = await pool.query(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      ['creator@example.com'],
    );
    userId = u[0]!.id;

    const { rows: tt } = await pool.query(
      `INSERT INTO ticket_types (workspace_id, name, category, is_default)
       VALUES ($1, 'Incident', 'incident', true) RETURNING id`,
      [workspaceId],
    );
    ticketTypeId = tt[0]!.id;

    const { rows: pr } = await pool.query(
      `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
       VALUES ($1, 'normal', 2, true) RETURNING id`,
      [workspaceId],
    );
    priorityId = pr[0]!.id;

    // Second workspace for cross-workspace isolation tests
    const { rows: ows } = await pool.query(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      ['Other Workspace'],
    );
    const otherWorkspaceId = ows[0]!.id;
    const { rows: ott } = await pool.query(
      `INSERT INTO ticket_types (workspace_id, name, category, is_default)
       VALUES ($1, 'Incident', 'incident', true) RETURNING id`,
      [otherWorkspaceId],
    );
    otherTicketTypeId = ott[0]!.id;
    const { rows: opr } = await pool.query(
      `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
       VALUES ($1, 'normal', 2, true) RETURNING id`,
      [otherWorkspaceId],
    );
    otherPriorityId = opr[0]!.id;

    // Inactive configuration records for active-state tests
    const { rows: itt } = await pool.query(
      `INSERT INTO ticket_types (workspace_id, name, category, is_default, is_active)
       VALUES ($1, 'Inactive Type', 'incident', false, false) RETURNING id`,
      [workspaceId],
    );
    inactiveTicketTypeId = itt[0]!.id;
    const { rows: ipr } = await pool.query(
      `INSERT INTO priorities (workspace_id, name, sort_order, is_default, is_active)
       VALUES ($1, 'low', 4, false, false) RETURNING id`,
      [workspaceId],
    );
    inactivePriorityId = ipr[0]!.id;

    ticket = new PostgresTicket(pool);
  });

  afterEach(async () => {
    await pool.query('ROLLBACK');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects a Ticket created without a Ticket Type', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Ticket without a type',
        createdBy: userId,
        priorityId,
      } as Parameters<PostgresTicket['createTicket']>[0]),
    ).rejects.toThrow(/ticket type/i);
  });

  it('rejects a Ticket created without a Priority', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Ticket without a priority',
        createdBy: userId,
        ticketTypeId,
      } as Parameters<PostgresTicket['createTicket']>[0]),
    ).rejects.toThrow(/priority/i);
  });

  it('creates a Ticket with active same-Workspace configuration and reads back the same known values', async () => {
    const created = await ticket.createTicket({
      workspaceId,
      title: 'Configured ticket',
      description: 'With type and priority',
      ticketTypeId,
      priorityId,
      createdBy: userId,
    });

    const retrieved = await ticket.getTicket(workspaceId, created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Configured ticket');
    expect(retrieved!.description).toBe('With type and priority');
    expect(retrieved!.ticketTypeId).toBe(ticketTypeId);
    expect(retrieved!.priorityId).toBe(priorityId);
  });

  it('rejects a cross-Workspace Ticket Type', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Foreign type',
        createdBy: userId,
        ticketTypeId: otherTicketTypeId,
        priorityId,
      }),
    ).rejects.toThrow(/ticket type/i);
  });

  it('rejects a cross-Workspace Priority', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Foreign priority',
        createdBy: userId,
        ticketTypeId,
        priorityId: otherPriorityId,
      }),
    ).rejects.toThrow(/priority/i);
  });

  it('rejects an inactive Ticket Type', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Inactive type',
        createdBy: userId,
        ticketTypeId: inactiveTicketTypeId,
        priorityId,
      }),
    ).rejects.toThrow(/ticket type/i);
  });

  it('rejects an inactive Priority', async () => {
    await expect(
      ticket.createTicket({
        workspaceId,
        title: 'Inactive priority',
        createdBy: userId,
        ticketTypeId,
        priorityId: inactivePriorityId,
      }),
    ).rejects.toThrow(/priority/i);
  });
});
