import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresAudit } from './audit.js';

const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    actor_user_id UUID,
    workspace_id UUID,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let pool: Pool | null = null;

describe('PostgresAudit', () => {
  let audit: PostgresAudit;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
    });
    await pool.query(MIGRATION_SQL);
  });

  beforeEach(async () => {
    audit = new PostgresAudit(pool!);
    await pool!.query('DELETE FROM audit_events');
  });

  afterAll(async () => {
    await pool!.end();
  });

  it('appends an audit event', async () => {
    const wsId = crypto.randomUUID();
    await audit.append({
      kind: 'workspace-created',
      actorUserId: null,
      workspaceId: wsId,
      details: { name: 'Test Workspace' },
    });

    const events = await audit.query(wsId);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('workspace-created');
  });

  it('queries audit events by workspace', async () => {
    const ws1 = crypto.randomUUID();
    const ws2 = crypto.randomUUID();
    await audit.append({ kind: 'ticket-created', actorUserId: null, workspaceId: ws1, details: {} });
    await audit.append({ kind: 'ticket-created', actorUserId: null, workspaceId: ws2, details: {} });

    const ws1Events = await audit.query(ws1);
    const ws2Events = await audit.query(ws2);
    expect(ws1Events).toHaveLength(1);
    expect(ws2Events).toHaveLength(1);
  });

  it('queries all audit events when workspaceId is null', async () => {
    await audit.append({ kind: 'login', actorUserId: null, workspaceId: null, details: {} });
    await audit.append({ kind: 'logout', actorUserId: null, workspaceId: null, details: {} });

    const allEvents = await audit.query(null);
    expect(allEvents).toHaveLength(2);
  });

  it('respects limit parameter', async () => {
    const wsId = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      await audit.append({ kind: 'config-updated', actorUserId: null, workspaceId: wsId, details: { i } });
    }

    const limited = await audit.query(wsId, 5);
    expect(limited).toHaveLength(5);
  });

  it('includes ticket-related audit events', async () => {
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await audit.append({ kind: 'ticket-created', actorUserId: userId, workspaceId: wsId, details: { title: 'Test' } });
    await audit.append({ kind: 'ticket-cancelled', actorUserId: userId, workspaceId: wsId, details: {} });
    await audit.append({ kind: 'timeline-redacted', actorUserId: userId, workspaceId: wsId, details: { reason: 'PII' } });

    const events = await audit.query(wsId);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toContain('ticket-created');
    expect(events.map((e) => e.kind)).toContain('ticket-cancelled');
    expect(events.map((e) => e.kind)).toContain('timeline-redacted');
  });
});
