import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresTicket } from './postgres.js';
import type { CreateTicketInput } from '@ticketos/domain';

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
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ticket_type_id UUID,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets (workspace_id)`,
  `CREATE TABLE IF NOT EXISTS ticket_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS timeline_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('message', 'internal_note', 'system_event', 'status_change', 'priority_change', 'assignment_change')),
    content TEXT NOT NULL,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redacted_content TEXT,
    redacted_at TIMESTAMPTZ,
    redacted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    redact_reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline_entries (ticket_id, created_at)`,
  // P0-04 additions: redaction and cancellation columns
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_content TEXT`,
  `ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ`,
  `ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redact_reason TEXT`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority_id UUID`,
  `ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE priorities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
  // Ticket Type configuration referenced by every created Ticket
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (name TEXT PRIMARY KEY)`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
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
  // Workspace-configured Statuses (S1, S5) — the single source of truth for
  // Ticket status, referenced by `tickets.status_id` (migration 027).
  `CREATE TABLE IF NOT EXISTS status_categories (name TEXT PRIMARY KEY)`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
];

let pool: Pool | null = null;

describe('Ticket and Timeline', () => {
  let ticket: PostgresTicket;
  let userId: string;
  let wsId: string;
  let ticketTypeId: string;
  let priorityId: string;
  let newStatusId: string;
  let openStatusId: string;
  let closedStatusId: string;

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
    await pool!.query('DELETE FROM timeline_entries');
    await pool!.query('DELETE FROM ticket_followers');
    await pool!.query('DELETE FROM ticket_tags');
    await pool!.query('DELETE FROM tickets');
    await pool!.query('DELETE FROM statuses');
    await pool!.query('DELETE FROM ticket_types');
    await pool!.query('DELETE FROM priorities');
    await pool!.query('DELETE FROM workspace_memberships');
    await pool!.query('DELETE FROM queues');
    await pool!.query('DELETE FROM queue_members');
    await pool!.query('DELETE FROM organizations');
    await pool!.query('DELETE FROM magic_links');
    await pool!.query('DELETE FROM users');
    await pool!.query('DELETE FROM workspaces');

    const { rows: userRows } = await pool!.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'ticket-test@example.com'],
    );
    userId = userRows[0]!.id;

    const { rows: wsRows } = await pool!.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Ticket Test'],
    );
    wsId = wsRows[0]!.id;

    const { rows: ticketTypeRows } = await pool!.query(
      `INSERT INTO ticket_types (workspace_id, name, category, is_default)
       VALUES ($1, 'Incident', 'incident', true) RETURNING id`,
      [wsId],
    );
    ticketTypeId = ticketTypeRows[0]!.id;

    const { rows: priorityRows } = await pool!.query(
      `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
       VALUES ($1, 'normal', 2, true) RETURNING id`,
      [wsId],
    );
    priorityId = priorityRows[0]!.id;

    const insertStatus = async (
      name: string,
      category: string,
      sortOrder: number,
      isDefault: boolean,
      isActive = true,
    ): Promise<string> => {
      const { rows } = await pool!.query(
        `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [wsId, name, category, sortOrder, isDefault, isActive],
      );
      return rows[0]!.id;
    };

    newStatusId = await insertStatus('New', 'new', 1, true);
    openStatusId = await insertStatus('Open', 'open', 2, false);
    await insertStatus('Pending', 'pending', 3, false);
    await insertStatus('Resolved', 'resolved', 4, false);
    closedStatusId = await insertStatus('Closed', 'closed', 5, false);

    ticket = new PostgresTicket(pool!);
  });

  afterEach(async () => {
    await pool!.query('ROLLBACK');
  });

  afterAll(async () => {
    await pool!.end();
  });

  describe('createTicket', () => {
    it('creates a ticket with default values', async () => {
      const input: CreateTicketInput = {
        workspaceId: wsId as any,
        title: 'Test ticket',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      };
      const t = await ticket.createTicket(input);
      expect(t.title).toBe('Test ticket');
      expect(t.statusId).toBe(newStatusId);
      expect(t.statusName).toBe('New');
      expect(t.statusCategory).toBe('new');
      expect(t.priority).toBe('normal');
      expect(t.visibility).toBe('public');
      expect(t.id).toBeDefined();
      expect(t.workspaceId).toBe(wsId);
    });

    it('creates a ticket with custom values', async () => {
      const input: CreateTicketInput = {
        workspaceId: wsId as any,
        title: 'Urgent issue',
        description: 'Something is broken',
        priority: 'urgent',
        assignedTo: userId as any,
        visibility: 'internal',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      };
      const t = await ticket.createTicket(input);
      expect(t.priority).toBe('urgent');
      expect(t.description).toBe('Something is broken');
      expect(t.visibility).toBe('internal');
      expect(t.assignedTo).toBe(userId);
    });

    it('accepts an explicit Workspace Status', async () => {
      const t = await ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Explicit status',
        statusId: openStatusId,
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      });
      expect(t.statusId).toBe(openStatusId);
      expect(t.statusName).toBe('Open');
      expect(t.statusCategory).toBe('open');
    });

    it('rejects an inactive Status', async () => {
      const inactiveStatusId = await pool!.query(
        `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default, is_active)
         VALUES ($1, 'Retired', 'open', 9, false, false) RETURNING id`,
        [wsId],
      ).then((r) => r.rows[0]!.id);

      await expect(ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Inactive status',
        statusId: inactiveStatusId,
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      })).rejects.toThrow(/Status not found or inactive/);
    });

    it('rejects a Status from another Workspace', async () => {
      const { rows: otherWs } = await pool!.query(
        'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
        ['Other Status Workspace'],
      );
      const { rows: foreignStatus } = await pool!.query(
        `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default)
         VALUES ($1, 'New', 'new', 1, true) RETURNING id`,
        [otherWs[0]!.id],
      );

      await expect(ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Foreign status',
        statusId: foreignStatus[0]!.id,
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      })).rejects.toThrow(/Status not found or inactive/);
    });

    it('rejects creation when the Workspace has no Status configured', async () => {
      await pool!.query('DELETE FROM statuses WHERE workspace_id = $1', [wsId]);

      await expect(ticket.createTicket({
        workspaceId: wsId as any,
        title: 'No status workspace',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      })).rejects.toThrow(/No active Status is configured/);
    });
  });

  describe('getTicket', () => {
    it('returns a ticket by id', async () => {
      const t = await ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Get me',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      });
      const found = await ticket.getTicket(wsId as any, t.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Get me');
    });

    it('returns null for non-existent ticket', async () => {
      const found = await ticket.getTicket(wsId as any, crypto.randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('updateTicket', () => {
    it('updates ticket fields', async () => {
      const t = await ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Old title',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      });
      const updated = await ticket.updateTicket({
        id: t.id,
        title: 'New title',
        statusId: openStatusId,
        priority: 'high',
      });
      expect(updated.title).toBe('New title');
      expect(updated.statusId).toBe(openStatusId);
      expect(updated.statusName).toBe('Open');
      expect(updated.statusCategory).toBe('open');
      expect(updated.priority).toBe('high');
    });

    it('rejects a Status that is not active in the Ticket Workspace', async () => {
      const t = await ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Reject status',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      });

      await expect(ticket.updateTicket({
        id: t.id,
        statusId: crypto.randomUUID(),
      })).rejects.toThrow(/Status not found or inactive/);
    });
  });

  describe('deleteTicket', () => {
    it('deletes a ticket', async () => {
      const t = await ticket.createTicket({
        workspaceId: wsId as any,
        title: 'Delete me',
        createdBy: userId as any,
        ticketTypeId,
        priorityId,
      });
      await ticket.deleteTicket(wsId as any, t.id);
      const found = await ticket.getTicket(wsId as any, t.id);
      expect(found).toBeNull();
    });
  });

  describe('listTickets', () => {
    it('lists all tickets in a workspace', async () => {
      await ticket.createTicket({ workspaceId: wsId as any, title: 'T1', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.createTicket({ workspaceId: wsId as any, title: 'T2', createdBy: userId as any, ticketTypeId, priorityId });
      const list = await ticket.listTickets(wsId as any);
      expect(list).toHaveLength(2);
    });

    it('filters by status', async () => {
      const t1 = await ticket.createTicket({ workspaceId: wsId as any, title: 'T1', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.updateTicket({ id: t1.id, statusId: openStatusId });
      await ticket.createTicket({ workspaceId: wsId as any, title: 'T2', createdBy: userId as any, ticketTypeId, priorityId });
      const list = await ticket.listTickets(wsId as any, { statusId: openStatusId });
      expect(list).toHaveLength(1);
      expect(list[0]!.title).toBe('T1');
      expect(list[0]!.statusId).toBe(openStatusId);
    });

    it('filters by priority', async () => {
      await ticket.createTicket({ workspaceId: wsId as any, title: 'T1', priority: 'high', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.createTicket({ workspaceId: wsId as any, title: 'T2', priority: 'low', createdBy: userId as any, ticketTypeId, priorityId });
      const list = await ticket.listTickets(wsId as any, { priority: 'high' });
      expect(list).toHaveLength(1);
    });
  });

  describe('Timeline entries', () => {
    it('appends a message to a ticket', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Timeline test', createdBy: userId as any, ticketTypeId, priorityId });
      const entry = await ticket.appendTimelineEntry({
        ticketId: t.id,
        kind: 'message',
        content: 'Hello world',
        authorId: userId as any,
        visibility: 'public',
      });
      expect(entry.kind).toBe('message');
      expect(entry.content).toBe('Hello world');
    });

    it('appends an internal note', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Internal test', createdBy: userId as any, ticketTypeId, priorityId });
      const entry = await ticket.appendTimelineEntry({
        ticketId: t.id,
        kind: 'internal_note',
        content: 'Agent note',
        authorId: userId as any,
        visibility: 'internal',
      });
      expect(entry.kind).toBe('internal_note');
    });

    it('appends a system event', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'System test', createdBy: userId as any, ticketTypeId, priorityId });
      const entry = await ticket.appendTimelineEntry({
        ticketId: t.id,
        kind: 'system_event',
        content: 'Ticket created',
        authorId: null,
        visibility: 'public',
      });
      expect(entry.kind).toBe('system_event');
      expect(entry.authorId).toBeNull();
    });

    it('gets timeline entries ordered by creation', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Ordered test', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.appendTimelineEntry({ ticketId: t.id, kind: 'message', content: 'First', authorId: userId as any, visibility: 'public' });
      await ticket.appendTimelineEntry({ ticketId: t.id, kind: 'message', content: 'Second', authorId: userId as any, visibility: 'public' });

      const entries = await ticket.getTimeline(t.id);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.content).toBe('First');
      expect(entries[1]!.content).toBe('Second');
    });

    it('filters timeline by kind', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Filter test', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.appendTimelineEntry({ ticketId: t.id, kind: 'message', content: 'Msg', authorId: userId as any, visibility: 'public' });
      await ticket.appendTimelineEntry({ ticketId: t.id, kind: 'system_event', content: 'Sys', authorId: null, visibility: 'public' });

      const msgs = await ticket.getTimeline(t.id, { kind: 'message' });
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.kind).toBe('message');
    });
  });

  describe('Tags', () => {
    it('adds a tag to a ticket', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Tag test', createdBy: userId as any, ticketTypeId, priorityId });
      const tag = await ticket.addTag(t.id, 'bug');
      expect(tag.name).toBe('bug');
      expect(tag.ticketId).toBe(t.id);
    });

    it('lists tags for a ticket', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Tag list test', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.addTag(t.id, 'bug');
      await ticket.addTag(t.id, 'frontend');
      const tags = await ticket.getTags(t.id);
      expect(tags).toHaveLength(2);
    });

    it('removes a tag', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Tag remove test', createdBy: userId as any, ticketTypeId, priorityId });
      const tag = await ticket.addTag(t.id, 'temp');
      await ticket.removeTag(t.id, tag.id);
      const tags = await ticket.getTags(t.id);
      expect(tags).toHaveLength(0);
    });
  });

  describe('Followers', () => {
    it('adds a follower', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Follower test', createdBy: userId as any, ticketTypeId, priorityId });
      const follower = await ticket.addFollower(t.id, userId as any);
      expect(follower.ticketId).toBe(t.id);
      expect(follower.userId).toBe(userId);
    });

    it('lists followers', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Followers list', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.addFollower(t.id, userId as any);
      const followers = await ticket.getFollowers(t.id);
      expect(followers).toHaveLength(1);
    });

    it('removes a follower', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Follower remove', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.addFollower(t.id, userId as any);
      await ticket.removeFollower(t.id, userId as any);
      const followers = await ticket.getFollowers(t.id);
      expect(followers).toHaveLength(0);
    });
  });

  describe('Redaction', () => {
    it('redacts a timeline entry and saves original content', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Redact test', createdBy: userId as any, ticketTypeId, priorityId });
      const entry = await ticket.appendTimelineEntry({
        ticketId: t.id,
        kind: 'message',
        content: 'Sensitive information here',
        authorId: userId as any,
        visibility: 'public',
      });

      const redacted = await ticket.redactTimelineEntry(entry.id, 'Contains PII', userId as any);
      expect(redacted.content).toContain('REDACTED');
      expect(redacted.content).toContain('Contains PII');
    });

    it('redacted entries are not returned in normal getTimeline', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Filter test', createdBy: userId as any, ticketTypeId, priorityId });
      const entry1 = await ticket.appendTimelineEntry({
        ticketId: t.id, kind: 'message', content: 'Public msg', authorId: userId as any, visibility: 'public',
      });
      const entry2 = await ticket.appendTimelineEntry({
        ticketId: t.id, kind: 'message', content: 'Secret msg', authorId: userId as any, visibility: 'public',
      });

      await ticket.redactTimelineEntry(entry2.id, 'PII removed', userId as any);

      const timeline = await ticket.getTimeline(t.id);
      expect(timeline).toHaveLength(1);
      expect(timeline[0]!.id).toBe(entry1.id);
    });
  });

  describe('Cancellation', () => {
    it('cancels a ticket when requested by the creator', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Cancel me', createdBy: userId as any, ticketTypeId, priorityId });
      const cancelled = await ticket.cancelTicket(wsId as any, t.id, userId as any);
      expect(cancelled.statusId).toBe(closedStatusId);
      expect(cancelled.statusName).toBe('Closed');
      expect(cancelled.statusCategory).toBe('closed');
    });

    it('rejects cancellation when the Workspace has no closed Status', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'No closed status', createdBy: userId as any, ticketTypeId, priorityId });
      await pool!.query(
        "DELETE FROM statuses WHERE workspace_id = $1 AND category = 'closed'",
        [wsId],
      );
      await expect(ticket.cancelTicket(wsId as any, t.id, userId as any)).rejects.toThrow(
        /No active closed Status/,
      );
    });

    it('rejects cancellation by non-creator', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Not mine', createdBy: userId as any, ticketTypeId, priorityId });
      const otherUserId = crypto.randomUUID();
      await expect(ticket.cancelTicket(wsId as any, t.id, otherUserId as any)).rejects.toThrow('Only the ticket creator');
    });

    it('rejects double cancellation', async () => {
      const t = await ticket.createTicket({ workspaceId: wsId as any, title: 'Already cancelled', createdBy: userId as any, ticketTypeId, priorityId });
      await ticket.cancelTicket(wsId as any, t.id, userId as any);
      await expect(ticket.cancelTicket(wsId as any, t.id, userId as any)).rejects.toThrow('already cancelled');
    });
  });
});
