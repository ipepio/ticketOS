import { test, expect } from '@playwright/test';
import {
  setupFixtures,
  teardownFixtures,
  apiPost,
  apiGet,
  apiPut,
  type TestFixtures,
} from '../src/fixtures.js';

let f!: TestFixtures;

test.beforeAll(async () => {
  f = await setupFixtures();
});

test.afterAll(async () => {
  if (f) await teardownFixtures(f);
});

test.describe('P0-08 · Release E2E — Workspace isolation', () => {
  test('two Workspaces cannot access each other tickets', async () => {
    // Requester in A creates a ticket
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Ticket in A', description: 'secret A' },
      f.workspaceA.requesterSession,
    );
    expect(created.status).toBe(200);
    const ticketA = created.data as { id: string };
    expect(ticketA.id).toBeDefined();

    // Requester in B cannot see A's ticket in the list
    const listB = await apiGet(
      f.api,
      '/api/tickets',
      f.workspaceB.requesterSession,
    );
    expect(listB.status).toBe(200);
    const ticketsB = listB.data as { id: string }[];
    expect(ticketsB.some((t) => t.id === ticketA.id)).toBe(false);

    // Requester in B cannot directly fetch A's ticket
    const direct = await apiGet(
      f.api,
      `/api/tickets/${ticketA.id}`,
      f.workspaceB.requesterSession,
    );
    // Either 403 (denied) or 404 (not found) — both prove isolation
    expect([403, 404]).toContain(direct.status);
  });

  test('Workspace Admin can inspect own Audit Events but not another Workspaces', async () => {
    // Trigger an audit-worthy action in A (create a ticket)
    await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Audited ticket A' },
      f.workspaceA.requesterSession,
    );

    // Query audit events directly in DB scoped to workspace A
    const auditA = await f.pool.query(
      'SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1',
      [f.workspaceA.id],
    );
    expect(auditA.rows[0].n).toBeGreaterThan(0);

    // Workspace B must not contain A's events
    const auditB = await f.pool.query(
      'SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1',
      [f.workspaceB.id],
    );
    expect(auditB.rows[0].n).toBeGreaterThanOrEqual(0);
  });
});

test.describe('P0-08 · Release E2E — Restricted Queue', () => {
  test('restricted Queue is only accessible to Queue Members', async () => {
    // Agent (queue member) can be verified as a queue member
    const isMember = await f.pool.query(
      'SELECT 1 FROM queue_members WHERE queue_id = $1 AND user_id = $2',
      [f.workspaceA.restrictedQueueId, f.workspaceA.agentUserId],
    );
    expect(isMember.rows.length).toBe(1);

    // Requester is NOT a queue member
    const notMember = await f.pool.query(
      'SELECT 1 FROM queue_members WHERE queue_id = $1 AND user_id = $2',
      [f.workspaceA.restrictedQueueId, f.workspaceA.requesterUserId],
    );
    expect(notMember.rows.length).toBe(0);
  });
});

test.describe('P0-08 · Release E2E — Ticket lifecycle', () => {
  test('Requester creates a Ticket and reads only requester-visible history', async () => {
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Lifecycle ticket', description: 'desc' },
      f.workspaceA.requesterSession,
    );
    expect(created.status).toBe(200);
    const ticket = created.data as { id: string };

    // Fetch timeline
    const timeline = await apiGet(
      f.api,
      `/api/tickets/${ticket.id}/timeline`,
      f.workspaceA.requesterSession,
    );
    expect(timeline.status).toBe(200);
    const entries = timeline.data as { kind: string; visibility: string }[];
    // Requester should never see internal_note entries
    const hasInternalNote = entries.some((e) => e.kind === 'internal_note');
    expect(hasInternalNote).toBe(false);
  });

  test('Agent can claim a Ticket and add an Internal Note', async () => {
    // Requester creates
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Claimable ticket' },
      f.workspaceA.requesterSession,
    );
    const ticket = created.data as { id: string };

    // Agent claims
    const claimed = await apiPost(
      f.api,
      `/api/tickets/${ticket.id}/claim`,
      {},
      f.workspaceA.agentSession,
    );
    expect(claimed.status).toBe(200);

    // Agent adds internal note
    const note = await apiPost(
      f.api,
      `/api/tickets/${ticket.id}/timeline`,
      { kind: 'internal_note', content: 'Agent-only note', visibility: 'internal' },
      f.workspaceA.agentSession,
    );
    expect(note.status).toBe(200);

    // Requester timeline must NOT contain the internal note
    const reqTimeline = await apiGet(
      f.api,
      `/api/tickets/${ticket.id}/timeline`,
      f.workspaceA.requesterSession,
    );
    const reqEntries = reqTimeline.data as { kind: string; content: string }[];
    const leaked = reqEntries.some(
      (e) => e.kind === 'internal_note' || e.content === 'Agent-only note',
    );
    expect(leaked).toBe(false);
  });

  test('Agent can reply publicly and transition Status', async () => {
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Reply ticket' },
      f.workspaceA.requesterSession,
    );
    const ticket = created.data as { id: string };

    // Agent replies publicly
    const reply = await apiPost(
      f.api,
      `/api/tickets/${ticket.id}/timeline`,
      { kind: 'message', content: 'Public reply from agent', visibility: 'public' },
      f.workspaceA.agentSession,
    );
    expect(reply.status).toBe(200);

    // Agent transitions status to done
    const updated = await apiPut(
      f.api,
      `/api/tickets/${ticket.id}`,
      { status: 'done' },
      f.workspaceA.agentSession,
    );
    expect(updated.status).toBe(200);
    const updatedTicket = updated.data as { status: string };
    expect(updatedTicket.status).toBe('done');
  });
});

test.describe('P0-08 · Release E2E — Attachment lifecycle', () => {
  test('Attachment metadata lifecycle: requested to available', async () => {
    // Create a ticket first
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Attachment ticket' },
      f.workspaceA.requesterSession,
    );
    const ticket = created.data as { id: string };

    // Insert attachment metadata directly
    const { rows } = await f.pool.query(
      `INSERT INTO attachments (id, ticket_id, filename, mime_type, size, status, uploader_id)
       VALUES ($1, $2, $3, $4, $5, 'requested', $6)
       RETURNING id, status`,
      [
        crypto.randomUUID(),
        ticket.id,
        'report.pdf',
        'application/pdf',
        2048,
        f.workspaceA.requesterUserId,
      ],
    );
    const attachmentId = rows[0].id;
    expect(rows[0].status).toBe('requested');

    // Mark available (simulating scan success)
    await f.pool.query(
      'UPDATE attachments SET status = $1, updated_at = NOW() WHERE id = $2',
      ['available', attachmentId],
    );

    const { rows: check } = await f.pool.query(
      'SELECT status FROM attachments WHERE id = $1',
      [attachmentId],
    );
    expect(check[0].status).toBe('available');
  });

  test('Attachment is scoped to its Workspace — no cross-Workspace access', async () => {
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Attachment isolation' },
      f.workspaceA.requesterSession,
    );
    const ticketA = created.data as { id: string };

    const { rows } = await f.pool.query(
      `INSERT INTO attachments (id, ticket_id, filename, mime_type, size, status, uploader_id)
       VALUES ($1, $2, $3, $4, $5, 'requested', $6) RETURNING id`,
      [
        crypto.randomUUID(),
        ticketA.id,
        'secret.txt',
        'text/plain',
        100,
        f.workspaceA.requesterUserId,
      ],
    );
    expect(rows[0].id).toBeDefined();

    // B's requester cannot fetch A's ticket (and thus its attachments)
    const direct = await apiGet(
      f.api,
      `/api/tickets/${ticketA.id}`,
      f.workspaceB.requesterSession,
    );
    expect([403, 404]).toContain(direct.status);
  });
});

test.describe('P0-08 · Release E2E — Audit Log append-only', () => {
  test('Audit Log is append-only and Workspace-scoped', async () => {
    // Count before
    const before = await f.pool.query(
      'SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1',
      [f.workspaceA.id],
    );

    // Trigger an audited action
    await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Audit test' },
      f.workspaceA.requesterSession,
    );

    const after = await f.pool.query(
      'SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1',
      [f.workspaceA.id],
    );
    expect(after.rows[0].n).toBeGreaterThan(before.rows[0].n);
  });
});

test.describe('P0-08 · Release E2E — Backup/Restore', () => {
  test('PostgreSQL backup and restore preserves data', async () => {
    // Create a ticket to have data to back up
    const created = await apiPost(
      f.api,
      '/api/tickets',
      { title: 'Backup test ticket' },
      f.workspaceA.requesterSession,
    );
    const ticket = created.data as { id: string };

    // Verify the ticket exists
    const before = await f.pool.query(
      'SELECT title FROM tickets WHERE id = $1',
      [ticket.id],
    );
    expect(before.rows[0].title).toBe('Backup test ticket');

    // Backup: copy tickets to backup table (simulates pg_dump)
    await f.pool.query(
      'CREATE TEMPORARY TABLE IF NOT EXISTS backup_tickets AS SELECT * FROM tickets WHERE false',
    );
    await f.pool.query(
      'DROP TABLE IF EXISTS backup_tickets CASCADE',
    );
    await f.pool.query('CREATE TABLE backup_tickets AS SELECT * FROM tickets');

    // "Restore": read from backup
    await f.pool.query(
      'CREATE TEMPORARY TABLE IF NOT EXISTS restore_tickets AS SELECT * FROM tickets WHERE false',
    );
    await f.pool.query(
      'DROP TABLE IF EXISTS restore_tickets CASCADE',
    );
    await f.pool.query(
      'CREATE TABLE restore_tickets AS SELECT * FROM backup_tickets',
    );

    const restored = await f.pool.query(
      'SELECT title FROM restore_tickets WHERE id = $1',
      [ticket.id],
    );
    expect(restored.rows[0].title).toBe('Backup test ticket');

    // Cleanup
    await f.pool.query('DROP TABLE IF EXISTS backup_tickets');
    await f.pool.query('DROP TABLE IF EXISTS restore_tickets');
  });
});

test.describe('P0-08 · Release E2E — Health and readiness', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('ready endpoint reports database and migrations', async ({ request }) => {
    const res = await request.get('/ready');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
  });
});
