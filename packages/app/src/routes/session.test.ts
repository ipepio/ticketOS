import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import crypto from 'node:crypto';
import { initApp, shutdownApp } from '../app.js';
import { configSchema } from '../config.js';
import type { Config } from '../config.js';

/**
 * Durable interactive sessions (S2).
 *
 * Feature specs: docs/specs/operational-portal-completion.md, F2
 *   - "Interactive sessions last 30 days."
 *   - "Activity renews both server expiry and browser cookie consistently."
 *   - "Logout invalidates the session immediately."
 *   - "Expired and invalid sessions return to authentication without losing a
 *     safe post-login destination such as “create Ticket”." (the destination
 *     half is a browser journey, covered by session-journeys.spec.ts)
 *
 * The seam is the Auth HTTP interface: every assertion observes a response a
 * real browser would receive (session payload, Set-Cookie) and, where the spec
 * names the server-side window explicitly, the session row that request wrote.
 * The test owns a scratch database it creates and drops, so running it never
 * mutates the shared test database.
 */
describe('Durable interactive sessions', () => {
  // Fixed identifier: CREATE/DROP DATABASE cannot take bind parameters, and a
  // fixed name mirrors how the e2e suite owns ticketos_e2e. Idempotent drop on
  // both sides keeps a crashed run from poisoning the next one.
  const SCRATCH_DATABASE = 'ticketos_session_test';
  const baseUrl =
    process.env.DATABASE_URL ??
    'postgresql://ticketos:ticketos@localhost:5432/ticketos';

  // S2 — "Interactive sessions last 30 days."
  const SESSION_WINDOW_SECONDS = 30 * 24 * 60 * 60;
  // Database round-trips and clock drift between the check and the read.
  const TOLERANCE_SECONDS = 120;

  const WORKSPACE_NAME = 'Session Workspace';
  const ADMIN_EMAIL = 'session-owner@example.com';

  let app: FastifyInstance | null = null;
  let adminPool: Pool | null = null;
  let probePool: Pool | null = null;
  let workspaceId = '';
  let adminUserId = '';
  // The bootstrap response is captured in the hook so that the first test can
  // assert the bootstrap-issued session without owning installation setup.
  let bootstrap: LightMyRequestResponse | null = null;

  const withUrl = (database: string): string => {
    const url = new URL(baseUrl);
    url.pathname = `/${database}`;
    return url.toString();
  };

  /** Join every Set-Cookie header the response wrote into one searchable string. */
  const setCookie = (res: LightMyRequestResponse): string => {
    const raw = res.headers['set-cookie'];
    if (raw === undefined) return '';
    return Array.isArray(raw) ? raw.join('\n') : String(raw);
  };

  /** Seconds until the stored session expires (negative when already expired). */
  const remainingSeconds = async (sessionId: string): Promise<number> => {
    const { rows } = await probePool!.query(
      `SELECT EXTRACT(EPOCH FROM (expires_at - NOW()))::float8 AS seconds
         FROM sessions WHERE id = $1`,
      [sessionId],
    );
    return rows.length === 0 ? Number.NaN : rows[0]!.seconds;
  };

  /**
   * Seed a session row the way an earlier login would have left it. The interval
   * is relative to now, so `-1 hour` is a session that already lapsed.
   */
  const insertSession = async (expiresAfter: string): Promise<string> => {
    const sessionId = crypto.randomUUID();
    await probePool!.query(
      `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + $5::interval)`,
      [sessionId, adminUserId, workspaceId, JSON.stringify({}), expiresAfter],
    );
    return sessionId;
  };

  const sessionCheck = (sessionId?: string) =>
    app!.inject({
      method: 'GET',
      url: '/api/auth/session',
      ...(sessionId ? { cookies: { sessionId } } : {}),
    });

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: withUrl('postgres'), max: 1 });
    await adminPool.query(
      'DROP DATABASE IF EXISTS ticketos_session_test WITH (FORCE)',
    );
    await adminPool.query('CREATE DATABASE ticketos_session_test');

    const config: Config = configSchema.parse({
      DATABASE_URL: withUrl(SCRATCH_DATABASE),
      SESSION_SECRET: 'session-test-session-secret-0123456789abcd',
      REPLY_TOKEN_SECRET: 'session-test-reply-secret-0123456789abcdef',
      LOG_LEVEL: 'silent',
    });

    // initApp runs the real migrations, so session expiry is observed against
    // the production schema and the real Auth routes.
    ({ app } = await initApp(config));
    probePool = new Pool({ connectionString: withUrl(SCRATCH_DATABASE), max: 2 });

    bootstrap = await app.inject({
      method: 'POST',
      url: '/api/setup/bootstrap',
      payload: { workspaceName: WORKSPACE_NAME, adminEmail: ADMIN_EMAIL },
    });
    const body = bootstrap.json() as { workspaceId?: string };
    workspaceId = body.workspaceId ?? '';
    const { rows } = await probePool.query<{ user_id: string }>(
      'SELECT user_id FROM workspace_memberships WHERE workspace_id = $1',
      [workspaceId],
    );
    adminUserId = rows[0]!.user_id;
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
          probePool = null;
        }
      } finally {
        if (adminPool) {
          try {
            await adminPool.query(
              'DROP DATABASE IF EXISTS ticketos_session_test WITH (FORCE)',
            );
          } catch {
            // The scratch database is dropped again on the next run's setup.
          }
          await adminPool.end();
          adminPool = null;
        }
      }
    }
  });

  it('issues a 30-day interactive session at bootstrap, with a cookie of the same window', async () => {
    expect(bootstrap!.statusCode).toBe(200);
    expect(bootstrap!.json()).toEqual({
      workspaceId,
      message: 'Installation configured.',
    });

    const cookie = setCookie(bootstrap!);
    const sessionId = /sessionId=([^;]+)/.exec(cookie)?.[1];
    expect(sessionId).toBeTruthy();
    // The browser keeps the cookie exactly as long as the server keeps the row.
    expect(cookie).toContain(`Max-Age=${SESSION_WINDOW_SECONDS}`);

    const seconds = await remainingSeconds(sessionId!);
    expect(seconds).toBeGreaterThan(SESSION_WINDOW_SECONDS - TOLERANCE_SECONDS);
    expect(seconds).toBeLessThanOrEqual(SESSION_WINDOW_SECONDS + TOLERANCE_SECONDS);
  });

  it('renews the browser cookie and the server expiry together on activity', async () => {
    // A session created a month of activity ago is down to its last hour.
    const sessionId = await insertSession('1 hour');
    expect(await remainingSeconds(sessionId)).toBeLessThan(4000);

    const res = await sessionCheck(sessionId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      authenticated: true,
      userId: adminUserId,
      workspaceId,
      workspaces: [{ id: workspaceId, name: WORKSPACE_NAME, role: 'workspace-admin' }],
    });

    // Both halves of the renewal: the cookie the browser stores ...
    const cookie = setCookie(res);
    expect(cookie).toContain(`sessionId=${sessionId}`);
    expect(cookie).toContain(`Max-Age=${SESSION_WINDOW_SECONDS}`);

    // ... and the server-side row, extended by the full window in the same response.
    const renewed = await remainingSeconds(sessionId);
    expect(renewed).toBeGreaterThan(SESSION_WINDOW_SECONDS - TOLERANCE_SECONDS);
    expect(renewed).toBeLessThanOrEqual(SESSION_WINDOW_SECONDS + TOLERANCE_SECONDS);
  });

  it('invalidates the session immediately on logout', async () => {
    const sessionId = await insertSession('30 days');
    const before = await sessionCheck(sessionId);
    expect(before.statusCode).toBe(200);
    expect((before.json() as { authenticated: boolean }).authenticated).toBe(true);

    const res = await app!.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { sessionId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: 'Logged out' });
    // The cookie the browser holds is cleared in the same response.
    expect(setCookie(res)).toContain('Max-Age=0');

    // The old cookie no longer authenticates, and it is not an error shape.
    const after = await sessionCheck(sessionId);
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual({ authenticated: false });

    const { rows } = await probePool!.query(
      'SELECT count(*)::int AS count FROM sessions WHERE id = $1',
      [sessionId],
    );
    expect(rows[0]!.count).toBe(0);
  });

  it('treats an expired session as unauthenticated without renewing it or erroring', async () => {
    const sessionId = await insertSession('-1 hour');

    const res = await sessionCheck(sessionId);
    // S2 — an expired session is an authentication state, never a server error.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
    // The dead cookie is cleared so the browser stops sending it.
    expect(setCookie(res)).toContain('Max-Age=0');

    // Expiry is not slid forward for a session that already lapsed.
    expect(await remainingSeconds(sessionId)).toBeLessThan(0);
  });

  it('treats an unknown session id as unauthenticated', async () => {
    const res = await sessionCheck(crypto.randomUUID());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
    expect(setCookie(res)).toContain('Max-Age=0');
  });

  it('reports an unauthenticated request without a session cookie and writes no cookie', async () => {
    const res = await sessionCheck();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('lets a request without a session cookie log out without touching stored sessions', async () => {
    const { rows: before } = await probePool!.query(
      'SELECT count(*)::int AS count FROM sessions',
    );

    const res = await app!.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: 'Logged out' });

    const { rows: after } = await probePool!.query(
      'SELECT count(*)::int AS count FROM sessions',
    );
    expect(after[0]!.count).toBe(before[0]!.count);
  });
});
