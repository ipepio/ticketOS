import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  apiGet,
  apiPost,
  setupFixtures,
  teardownFixtures,
  type TestFixtures,
} from '../src/fixtures.js';

/**
 * Durable sessions — browser journeys for F2 (S2) and TDD slice 18.
 *
 * Feature specs: docs/specs/operational-portal-completion.md
 *   - "Interactive sessions last 30 days."
 *   - "Activity renews both server expiry and browser cookie consistently."
 *   - "Logout invalidates the session immediately."
 *   - "Expired and invalid sessions return to authentication without losing a
 *     safe post-login destination such as “create Ticket”."
 *   - Slice 18: "An active session remains authenticated after renewal."
 *
 * The seam is the browser: the portal's own session check is the only thing
 * renewing a session, so every assertion here observes rendered UI, the browser
 * cookie jar, or the portal's own HTTP calls. Sessions are seeded through
 * ../src/fixtures.js (the same rows a completed magic link would create), and
 * expired rows are seeded by this spec, so no shared session is invalidated.
 */

let f: TestFixtures | undefined;

test.beforeAll(async () => { f = await setupFixtures(); });
test.afterAll(async () => { if (f) await teardownFixtures(f); });

// S2 — "Interactive sessions last 30 days."
const SESSION_WINDOW_SECONDS = 30 * 24 * 60 * 60;
// Room for the session check's database round-trip and the cookie jar read.
const TOLERANCE_SECONDS = 3600;

// ── Browser helpers ───────────────────────────────────────────────────────

/**
 * A browser context for one journey, in English.
 *
 * The project-wide `extraHTTPHeaders` would add `Content-Type: application/json`
 * to every request the *page* makes too, including the portal's bodyless
 * `POST /api/auth/logout`, which the server correctly rejects as an empty JSON
 * body. A real browser sends no such header, so the journeys clear it and let
 * the portal decide its own content type.
 */
async function englishContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ extraHTTPHeaders: {} });
  await context.addInitScript(() => {
    localStorage.setItem('ticketos-locale', 'en');
  });
  return context;
}

/**
 * Act as the given session exactly as a completed magic link would. The browser
 * expiry is optional: a short one makes the server-side renewal observable in
 * the browser cookie jar.
 */
async function asSession(
  context: BrowserContext,
  sessionId: string,
  expires?: number,
): Promise<void> {
  const url = new URL(f!.baseUrl);
  await context.addCookies([
    {
      name: 'sessionId',
      value: sessionId,
      domain: url.hostname,
      path: '/',
      ...(expires === undefined ? {} : { expires }),
    },
  ]);
}

async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies(f!.baseUrl);
  return cookies.find((cookie) => cookie.name === 'sessionId');
}

async function goHome(page: Page): Promise<void> {
  await page.goto(f!.baseUrl, { waitUntil: 'domcontentloaded' });
}

/**
 * Seed a session row for an existing User, the way an earlier login would have
 * left it. The interval is relative to now, so `-1 hour` is a dead session.
 */
async function insertSession(
  userId: string,
  workspaceId: string,
  expiresAfter: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await f!.pool.query(
    `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + $5::interval)`,
    [sessionId, userId, workspaceId, JSON.stringify({}), expiresAfter],
  );
  return sessionId;
}

// ── Journey A — slice 18: an active session survives renewal ──────────────

test.describe('Journey A — an active session remains authenticated after renewal', () => {
  test('renewal refreshes the browser cookie to the full window and keeps the user signed in', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      // Inject the fixture session with only an hour left in the browser jar, so
      // a refreshed cookie is distinguishable from the injected one.
      const oneHour = Math.floor(Date.now() / 1000) + 60 * 60;
      await asSession(context, f!.workspaceA.requesterSession, oneHour);
      const page = await context.newPage();

      // 1. A valid session lands on the authenticated shell.
      await goHome(page);
      await expect(page.getByTestId('ticket-list')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('landing-page')).toHaveCount(0);
      await expect(page.getByTestId('login-page')).toHaveCount(0);

      // 2. That page load ran the portal's session check, which renews the
      //    browser cookie to the full 30-day window.
      const renewed = await sessionCookie(context);
      expect(renewed?.value).toBe(f!.workspaceA.requesterSession);
      const nowSeconds = Date.now() / 1000;
      expect(renewed!.expires).toBeGreaterThan(
        nowSeconds + SESSION_WINDOW_SECONDS - TOLERANCE_SECONDS,
      );
      expect(renewed!.expires).toBeLessThanOrEqual(
        nowSeconds + SESSION_WINDOW_SECONDS + TOLERANCE_SECONDS,
      );

      // 3. A second navigation runs the renewal path again and the user is still
      //    authenticated — the renewed session never degrades into a login.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ticket-list')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('login-page')).toHaveCount(0);
      await expect(page.getByTestId('landing-page')).toHaveCount(0);

      const renewedAgain = await sessionCookie(context);
      expect(renewedAgain?.value).toBe(f!.workspaceA.requesterSession);
      expect(renewedAgain!.expires).toBeGreaterThan(
        Date.now() / 1000 + SESSION_WINDOW_SECONDS - TOLERANCE_SECONDS,
      );

      // 4. And the session endpoint the browser just called agrees.
      const session = await page.evaluate(async () => {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        return res.json() as Promise<{ authenticated: boolean; userId?: string }>;
      });
      expect(session.authenticated).toBe(true);
      expect(session.userId).toBe(f!.workspaceA.requesterUserId);
    } finally {
      await context.close();
    }
  });
});

// ── Journey B — logout invalidates the session immediately ────────────────

test.describe('Journey B — logout invalidates the session', () => {
  test('logging out returns to authentication and the old cookie no longer authenticates', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      // A dedicated row: this journey must destroy its own session, never a
      // fixture session another journey relies on.
      const sessionId = await insertSession(
        f!.workspaceA.adminUserId,
        f!.workspaceA.id,
        '30 days',
      );
      await asSession(context, sessionId);
      const page = await context.newPage();

      await goHome(page);
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('agent-queue')).toBeVisible({ timeout: 30_000 });

      // The portal's logout control lives in the sidebar footer.
      await page.locator('.sidebar-footer .workspace-switcher').click();

      // Back to authentication, with the authenticated shell gone immediately.
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('sidebar')).toHaveCount(0);

      // The old cookie is cleared and no longer authenticates: the very next
      // session check is unauthenticated rather than reporting a stale user.
      const cleared = await sessionCookie(context);
      expect(cleared === undefined || cleared.value === '').toBe(true);
      const session = await page.evaluate(async () => {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        return {
          status: res.status,
          body: (await res.json()) as { authenticated: boolean },
        };
      });
      expect(session.status).toBe(200);
      expect(session.body).toEqual({ authenticated: false });

      // Reloading does not resurrect the session.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('sidebar')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

// ── Journey C — expired session keeps the safe post-login destination ─────

test.describe('Journey C — an expired session returns to authentication and loses no destination', () => {
  test('a dead session cookie falls back to the landing flow and still reaches Ticket creation', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      // A session row that lapsed an hour ago, as an unattended browser would be.
      const expiredSession = await insertSession(
        f!.workspaceA.requesterUserId,
        f!.workspaceA.id,
        '-1 hour',
      );
      await asSession(context, expiredSession);
      const page = await context.newPage();

      // 1. The expired session is authentication-false, so the visitor gets the
      //    support landing — not an error page and not a broken shell.
      await goHome(page);
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('sidebar')).toHaveCount(0);
      await expect(page.getByTestId('ticket-list')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Internal Server Error');

      // 2. The visitor asks for a Ticket, which records the safe destination and
      //    moves them to authentication.
      await page.getByTestId('open-ticket-btn').click();
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10_000 });

      // 3. The destination survives the reload an out-of-app magic link causes.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });

      // 4. A completed magic link is simulated by injecting the fresh session the
      //    exchange would have created; the recorded destination is honoured.
      await asSession(context, f!.workspaceA.requesterSession);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('create-ticket')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#ticket-title')).toBeVisible();
      await expect(page.getByTestId('login-page')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

// ── Journey D — the session seam reports dead sessions as unauthenticated ──

test.describe('Journey D — expired, invalid and logged-out sessions are unauthenticated', () => {
  test('the session endpoint answers authenticated:false instead of an error', async () => {
    const expired = await insertSession(
      f!.workspaceA.requesterUserId,
      f!.workspaceA.id,
      '-1 minute',
    );
    const expiredRes = await apiGet(f!.api, '/api/auth/session', expired);
    expect(expiredRes.status).toBe(200);
    expect(expiredRes.data).toEqual({ authenticated: false });

    const invalidRes = await apiGet(f!.api, '/api/auth/session', crypto.randomUUID());
    expect(invalidRes.status).toBe(200);
    expect(invalidRes.data).toEqual({ authenticated: false });

    // A live session is authenticated ...
    const live = await insertSession(
      f!.workspaceA.requesterUserId,
      f!.workspaceA.id,
      '30 days',
    );
    const liveRes = await apiGet(f!.api, '/api/auth/session', live);
    expect(liveRes.status).toBe(200);
    expect((liveRes.data as { authenticated: boolean }).authenticated).toBe(true);

    // ... and stops being authenticated the moment it is logged out.
    const logoutRes = await apiPost(f!.api, '/api/auth/logout', {}, live);
    expect(logoutRes.status).toBe(200);
    const afterLogout = await apiGet(f!.api, '/api/auth/session', live);
    expect(afterLogout.status).toBe(200);
    expect(afterLogout.data).toEqual({ authenticated: false });
  });
});
