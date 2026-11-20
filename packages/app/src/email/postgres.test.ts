import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresEmail } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    access_mode TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open', 'restricted')),
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
  `CREATE TABLE IF NOT EXISTS email_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, address)
  )`,
  `CREATE TABLE IF NOT EXISTS correlation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS outbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT,
    in_reply_to TEXT,
    references_header TEXT,
    correlation_token_id UUID REFERENCES correlation_tokens(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS inbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL UNIQUE,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT,
    in_reply_to TEXT,
    references_header TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'quarantined', 'failed')),
    error_message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS intake_quarantine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbound_email_id UUID NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created_ticket', 'linked_ticket', 'dismissed')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Workspace-configured Statuses (S1, S5): email intake resolves the default
  // Status instead of writing a hard-coded status string.
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

describe('Email module', () => {
  let email: PostgresEmail;
  let userId: string;
  let wsId: string;
  let queueId: string;
  let defaultStatusId: string;

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
    await pool!.query('DELETE FROM intake_quarantine');
    await pool!.query('DELETE FROM inbound_emails');
    await pool!.query('DELETE FROM outbound_emails');
    await pool!.query('DELETE FROM correlation_tokens');
    await pool!.query('DELETE FROM email_addresses');
    await pool!.query('DELETE FROM timeline_entries');
    await pool!.query('DELETE FROM tickets');
    await pool!.query('DELETE FROM queue_members');
    await pool!.query('DELETE FROM queues');
    await pool!.query('DELETE FROM workspace_memberships');
    await pool!.query('DELETE FROM organizations');
    await pool!.query('DELETE FROM users');
    await pool!.query('DELETE FROM workspaces');

    const { rows: userRows } = await pool!.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'email-test@example.com'],
    );
    userId = userRows[0]!.id;

    const { rows: wsRows } = await pool!.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Email Test WS'],
    );
    wsId = wsRows[0]!.id;

    const { rows: queueRows } = await pool!.query(
      'INSERT INTO queues (id, workspace_id, name) VALUES ($1, $2, $3) RETURNING id',
      [crypto.randomUUID(), wsId, 'Support Queue'],
    );
    queueId = queueRows[0]!.id;

    const { rows: statusRows } = await pool!.query(
      `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default)
       VALUES ($1, 'New', 'new', 1, true) RETURNING id`,
      [wsId],
    );
    defaultStatusId = statusRows[0]!.id;

    email = new PostgresEmail(pool!);
  });

  afterEach(async () => {
    await pool!.query('ROLLBACK');
  });

  afterAll(async () => {
    await pool!.end();
  });

  describe('Email Address management', () => {
    it('creates an email address', async () => {
      const ea = await email.createEmailAddress({
        workspaceId: wsId as any,
        queueId: queueId as any,
        address: 'support@example.com',
      });
      expect(ea.address).toBe('support@example.com');
      expect(ea.workspaceId).toBe(wsId);
      expect(ea.queueId).toBe(queueId);
    });

    it('gets email address by id', async () => {
      const ea = await email.createEmailAddress({
        workspaceId: wsId as any,
        queueId: queueId as any,
        address: 'help@example.com',
      });
      const found = await email.getEmailAddress(ea.id);
      expect(found).not.toBeNull();
      expect(found!.address).toBe('help@example.com');
    });

    it('gets email address by address string', async () => {
      await email.createEmailAddress({
        workspaceId: wsId as any,
        queueId: queueId as any,
        address: 'info@example.com',
      });
      const found = await email.getEmailAddressByAddress('info@example.com');
      expect(found).not.toBeNull();
      expect(found!.address).toBe('info@example.com');
    });

    it('lists email addresses for a workspace', async () => {
      await email.createEmailAddress({ workspaceId: wsId as any, queueId: queueId as any, address: 'a@example.com' });
      await email.createEmailAddress({ workspaceId: wsId as any, queueId: queueId as any, address: 'b@example.com' });
      const list = await email.listEmailAddresses(wsId as any);
      expect(list).toHaveLength(2);
    });

    it('deletes an email address', async () => {
      const ea = await email.createEmailAddress({
        workspaceId: wsId as any,
        queueId: queueId as any,
        address: 'del@example.com',
      });
      await email.deleteEmailAddress(ea.id);
      const found = await email.getEmailAddress(ea.id);
      expect(found).toBeNull();
    });
  });

  describe('Outbound email', () => {
    it('sends an email', async () => {
      const result = await email.sendEmail({
        to: 'user@example.com',
        from: 'support@example.com',
        subject: 'Test subject',
        textBody: 'Hello world',
      });
      expect(result.status).toBe('pending');
      expect(result.to).toBe('user@example.com');
    });

    it('gets email status', async () => {
      const result = await email.sendEmail({
        to: 'user@example.com',
        from: 'support@example.com',
        subject: 'Status test',
        textBody: 'Test',
      });
      const status = await email.getEmailStatus(result.id);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('pending');
    });
  });

  describe('Correlation token', () => {
    it('creates a correlation token', async () => {
      const ticket = await createTestTicket();
      const token = await email.createCorrelationToken(ticket);
      expect(token.ticketId).toBe(ticket);
      expect(token.tokenHash).toBeDefined();
    });

    it('verifies a valid correlation token', async () => {
      const ticket = await createTestTicket();
      const token = await email.createCorrelationToken(ticket);
      const result = await email.verifyCorrelationToken(token.tokenHash);
      expect(result.valid).toBe(true);
      expect(result.ticketId).toBe(ticket);
    });

    it('rejects an invalid correlation token', async () => {
      const result = await email.verifyCorrelationToken('nonexistent-hash');
      expect(result.valid).toBe(false);
    });
  });

  describe('Intake Quarantine', () => {
    it('creates a quarantine item', async () => {
      const inboundId = await createTestInboundEmail();
      const item = await email.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: wsId as any,
        reason: 'Unknown sender',
        from: 'spammer@example.com',
        subject: 'Spam',
        textBody: 'Buy now!',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });
      expect(item.reason).toBe('Unknown sender');
      expect(item.status).toBe('pending');
    });

    it('lists quarantine items for a workspace', async () => {
      const inboundId = await createTestInboundEmail();
      await email.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: wsId as any,
        reason: 'Test',
        from: 'test@example.com',
        subject: 'Test',
        textBody: 'Test',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });
      const list = await email.listQuarantineItems(wsId as any);
      expect(list).toHaveLength(1);
    });

    it('creates a ticket from quarantine', async () => {
      const inboundId = await createTestInboundEmail();
      const item = await email.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: wsId as any,
        reason: 'Unknown sender',
        from: 'user@example.com',
        subject: 'Help needed',
        textBody: 'I need help',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });

      const result = await email.createTicketFromQuarantine(item.id, userId as any);
      expect(result.ticketId).toBeDefined();

      const updated = await email.getQuarantineItem(item.id);
      expect(updated!.status).toBe('created_ticket');
      expect(updated!.ticketId).toBe(result.ticketId);

      // S1: the intake Ticket starts in the Workspace's configured default
      // Status, never a hard-coded status string.
      const { rows: createdTicket } = await pool!.query(
        'SELECT status_id FROM tickets WHERE id = $1',
        [result.ticketId],
      );
      expect(createdTicket[0]!.status_id).toBe(defaultStatusId);
    });

    it('links a ticket to quarantine', async () => {
      const ticket = await createTestTicket();
      const inboundId = await createTestInboundEmail();
      const item = await email.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: wsId as any,
        reason: 'Invalid token',
        from: 'user@example.com',
        subject: 'Reply',
        textBody: 'My reply',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });

      await email.linkTicketToQuarantine(item.id, ticket, userId as any);

      const updated = await email.getQuarantineItem(item.id);
      expect(updated!.status).toBe('linked_ticket');
      expect(updated!.ticketId).toBe(ticket);
    });

    it('dismisses a quarantine item', async () => {
      const inboundId = await createTestInboundEmail();
      const item = await email.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: wsId as any,
        reason: 'Spam',
        from: 'spam@example.com',
        subject: 'Spam',
        textBody: 'Spam',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });

      await email.dismissQuarantineItem(item.id, userId as any);
      const updated = await email.getQuarantineItem(item.id);
      expect(updated!.status).toBe('dismissed');
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createTestTicket(): Promise<string> {
    const { rows } = await pool!.query(
      `INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [wsId, 'Test ticket', userId],
    );
    return rows[0]!.id;
  }

  async function createTestInboundEmail(): Promise<string> {
    const { rows } = await pool!.query(
      `INSERT INTO inbound_emails (message_id, "from", "to", subject, text_body, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [`msg-${crypto.randomUUID()}`, 'sender@example.com', 'support@example.com', 'Test', 'Test body'],
    );
    return rows[0]!.id;
  }
});
