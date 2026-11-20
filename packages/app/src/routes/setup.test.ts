import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { initApp, shutdownApp } from '../app.js';
import { configSchema } from '../config.js';
import type { Config } from '../config.js';

/**
 * First-run bootstrap contract (seam: browser portal → Setup HTTP interface).
 *
 * Regression for the "Bootstrap failed" defect: POST /api/setup/bootstrap on a
 * fresh installation must succeed and seed a configuration that obeys the
 * ordering and single-default rules introduced by migration 025. The test runs
 * against a scratch database it creates and drops itself, so the
 * "only one bootstrap per installation" guard is observed on a genuinely fresh
 * installation and the shared test database is never mutated.
 */
describe('First-run bootstrap contract', () => {
  // Fixed identifier: CREATE/DROP DATABASE cannot take bind parameters, and a
  // fixed name mirrors how the e2e suite owns ticketos_e2e. Idempotent drop on
  // both sides keeps a crashed run from poisoning the next one.
  const SCRATCH_DATABASE = 'ticketos_setup_test';
  const baseUrl =
    process.env.DATABASE_URL ??
    'postgresql://ticketos:ticketos@localhost:5432/ticketos';

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let app: FastifyInstance | null = null;
  let adminPool: Pool | null = null;
  let probePool: Pool | null = null;
  let workspaceId = '';

  const withUrl = (database: string): string => {
    const url = new URL(baseUrl);
    url.pathname = `/${database}`;
    return url.toString();
  };

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: withUrl('postgres'), max: 1 });
    await adminPool.query(
      'DROP DATABASE IF EXISTS ticketos_setup_test WITH (FORCE)',
    );
    await adminPool.query('CREATE DATABASE ticketos_setup_test');

    const config: Config = configSchema.parse({
      DATABASE_URL: withUrl(SCRATCH_DATABASE),
      SESSION_SECRET: 'setup-test-session-secret-0123456789abcdef',
      REPLY_TOKEN_SECRET: 'setup-test-reply-secret-0123456789abcdef',
      LOG_LEVEL: 'silent',
    });

    // initApp runs the real migrations against the scratch database, so the
    // bootstrap seeding is observed against the full production schema.
    ({ app } = await initApp(config));
    probePool = new Pool({
      connectionString: withUrl(SCRATCH_DATABASE),
      max: 1,
    });
  });

  afterAll(async () => {
    try {
      if (app) {
        await shutdownApp(app);
        app = null;
      }
    } finally {
      try {
        if (probePool) {
          await probePool.end();
        }
      } finally {
        if (adminPool) {
          try {
            await adminPool.query(
              'DROP DATABASE IF EXISTS ticketos_setup_test WITH (FORCE)',
            );
          } catch {
            // The scratch database is dropped again on the next run's setup.
          }
          await adminPool.end();
        }
      }
    }
  });

  it('reports a fresh installation as unconfigured', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: false });
  });

  it('rejects an incomplete bootstrap without writing anything', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/setup/bootstrap',
      payload: { adminEmail: 'owner@example.com' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'workspaceName and adminEmail are required',
    });

    const status = await app!.inject({
      method: 'GET',
      url: '/api/setup/status',
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ configured: false });
    const { rows } = await probePool!.query(
      'SELECT count(*)::int AS count FROM workspaces',
    );
    expect(rows[0]!.count).toBe(0);
  });

  it('bootstraps a fresh installation with a compliant seeded configuration', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/setup/bootstrap',
      payload: {
        workspaceName: 'Fresh Install',
        adminEmail: 'owner@example.com',
        adminName: 'Owner',
        timezone: 'Europe/Madrid',
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { workspaceId: string; message: string };
    workspaceId = body.workspaceId;
    expect(UUID_RE.test(workspaceId)).toBe(true);
    expect(body.message).toBe('Installation configured.');

    const setCookie = res.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookie).toContain('sessionId=');

    // Seeded Statuses: five rows, distinct positions 1..5, exactly one default.
    const { rows: statuses } = await probePool!.query(
      'SELECT name, sort_order, is_default FROM statuses WHERE workspace_id = $1 ORDER BY sort_order',
      [workspaceId],
    );
    expect(statuses.map((s) => s.sort_order)).toEqual([1, 2, 3, 4, 5]);
    expect(statuses.map((s) => s.name)).toEqual([
      'New',
      'Open',
      'Pending',
      'Resolved',
      'Closed',
    ]);
    expect(
      statuses.filter((s) => s.is_default).map((s) => s.name),
    ).toEqual(['New']);

    // Seeded Priorities: four rows, distinct positions 1..4, one default.
    const { rows: priorities } = await probePool!.query(
      'SELECT name, sort_order, is_default FROM priorities WHERE workspace_id = $1 ORDER BY sort_order',
      [workspaceId],
    );
    expect(priorities.map((p) => p.sort_order)).toEqual([1, 2, 3, 4]);
    expect(priorities.map((p) => p.name)).toEqual([
      'critical',
      'high',
      'normal',
      'low',
    ]);
    expect(
      priorities.filter((p) => p.is_default).map((p) => p.name),
    ).toEqual(['normal']);

    // Seeded Ticket Types: two rows, distinct positions 1..2, one default.
    const { rows: ticketTypes } = await probePool!.query(
      'SELECT name, sort_order, is_default FROM ticket_types WHERE workspace_id = $1 ORDER BY sort_order',
      [workspaceId],
    );
    expect(ticketTypes.map((t) => t.sort_order)).toEqual([1, 2]);
    expect(
      ticketTypes.filter((t) => t.is_default).map((t) => t.name),
    ).toEqual(['Incident']);

    // Inbox Queue uses the access mode retained by migration 025.
    const { rows: queues } = await probePool!.query(
      'SELECT name, access_mode FROM queues WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(queues).toEqual([{ name: 'Inbox', access_mode: 'workspace-agents' }]);

    // The admin user exists, is verified and is a workspace-admin.
    const { rows: memberships } = await probePool!.query(
      `SELECT m.role, u.verified_at IS NOT NULL AS verified
         FROM workspace_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1`,
      [workspaceId],
    );
    expect(memberships).toEqual([{ role: 'workspace-admin', verified: true }]);

    // A session was issued for immediate login, bound to the same workspace.
    const { rows: sessions } = await probePool!.query(
      'SELECT user_id, workspace_id FROM sessions WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(sessions).toHaveLength(1);
  });

  it('reports the installation as configured after bootstrap', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: true });
  });

  it('rejects a second bootstrap and leaves the installation unchanged', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/setup/bootstrap',
      payload: {
        workspaceName: 'Second Attempt',
        adminEmail: 'other@example.com',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Installation already configured' });

    const { rows } = await probePool!.query(
      'SELECT count(*)::int AS count FROM workspaces',
    );
    expect(rows[0]!.count).toBe(1);
  });
});
