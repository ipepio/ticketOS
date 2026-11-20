import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  setupFixtures,
  teardownFixtures,
  type TestFixtures,
} from '../src/fixtures.js';

/**
 * Landing and Ticket intake — browser journeys for F1 (S1) and TDD slice 19.
 *
 * Feature specs: docs/specs/operational-portal-completion.md
 *   - "A configured Installation has a clear support landing page with an
 *     “Open a Ticket” action."
 *   - "An authenticated Requester reaches the Ticket creation form directly."
 *   - "An unknown email receives localized, non-technical feedback. The product
 *     must not expose whether unrelated Workspace Memberships exist."
 *   - Slice 19: "The landing journey returns an authenticated Requester to
 *     Ticket creation."
 *
 * The seam is the browser: every assertion observes rendered UI or the portal's
 * own HTTP calls. Sessions are seeded through ../src/fixtures.js, so the
 * magic-link exchange itself stays covered by the API-level tests; the browser
 * journey injects the pre-created session cookie to simulate a completed link.
 */

let f: TestFixtures | undefined;

test.beforeAll(async () => { f = await setupFixtures(); });
test.afterAll(async () => { if (f) await teardownFixtures(f); });

// ── Browser helpers ───────────────────────────────────────────────────────

/** Every journey in this file runs in English unless it exercises the switcher. */
async function englishContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('ticketos-locale', 'en');
  });
  return context;
}

/** Act as the given pre-created session, exactly as a completed magic link would. */
async function asSession(context: BrowserContext, sessionId: string): Promise<void> {
  const url = new URL(f!.baseUrl);
  await context.addCookies([
    { name: 'sessionId', value: sessionId, domain: url.hostname, path: '/' },
  ]);
}

async function goHome(page: Page): Promise<void> {
  await page.goto(f!.baseUrl, { waitUntil: 'domcontentloaded' });
}

/** The landing CTA, addressed by its accessible name in the active locale. */
function openTicketButton(page: Page) {
  return page.getByTestId('open-ticket-btn');
}

// ── Journey A — the configured-installation landing (S1) ──────────────────

test.describe('Journey A — support landing for unauthenticated visitors', () => {
  test('visitor at / sees the support landing, not the raw login form or ticket navigation', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      const page = await context.newPage();
      await goHome(page);

      // The landing is the first thing an unauthenticated visitor sees.
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });
      await expect(openTicketButton(page)).toBeVisible();
      await expect(openTicketButton(page)).toHaveAccessibleName('Open a Ticket');

      // The tagline is real copy, and the locale switcher is available before login.
      await expect(page.getByTestId('landing-tagline')).toHaveText(
        'Open a ticket and our team takes it from there.',
      );
      await expect(page.getByTestId('locale-switcher')).toBeVisible();

      // NOT the raw login form.
      await expect(page.getByTestId('login-page')).toHaveCount(0);
      await expect(page.locator('#email')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);

      // No authenticated shell and no ticket navigation.
      await expect(page.getByTestId('sidebar')).toHaveCount(0);
      await expect(page.getByTestId('topbar')).toHaveCount(0);
      await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
      await expect(page.getByText('My Tickets')).toHaveCount(0);
      await expect(page.getByText('New Ticket')).toHaveCount(0);
      await expect(page.getByTestId('ticket-list')).toHaveCount(0);

      // Exactly one full-page state, not an overlay over a shell.
      await expect(page.locator('main')).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test('landing copy is localized for every supported locale', async ({ browser }) => {
    // Every locale in SUPPORTED_LOCALES, with its expected "Open a Ticket" action.
    const expected: Array<[string, string]> = [
      ['en', 'Open a Ticket'],
      ['es', 'Abrir un Ticket'],
      ['fr', 'Ouvrir un ticket'],
      ['de', 'Ticket öffnen'],
      ['pt', 'Abrir um ticket'],
      ['it', 'Apri un ticket'],
      ['nl', 'Ticket openen'],
      ['ja', 'チケットを作成'],
      ['zh', '创建工单'],
    ];

    const context = await englishContext(browser);
    try {
      const page = await context.newPage();
      await goHome(page);
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });

      for (const [code, label] of expected) {
        await page.getByTestId('locale-switcher').selectOption(code);
        await expect(openTicketButton(page)).toHaveAccessibleName(label);
        // The tagline resolves to a translation, never to a raw i18n key.
        const tagline = await page.getByTestId('landing-tagline').textContent();
        expect(tagline?.length ?? 0).toBeGreaterThan(0);
        expect(tagline).not.toContain('portal.');
      }
    } finally {
      await context.close();
    }
  });
});

// ── Journey B — slice 19: the landing returns a Requester to Ticket creation ──

test.describe('Journey B — post-login destination is preserved and consumed', () => {
  test('unauthenticated Requester asks for a Ticket, signs in, and lands on the creation form', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      const page = await context.newPage();
      await goHome(page);

      // 1. Landing → "Open a Ticket" leads to authentication.
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });
      await openTicketButton(page).click();
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

      // The intent survives a reload while the visitor is still unauthenticated
      // (a magic link can bring them back in a new page load of the same tab).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });

      // 2. The magic-link exchange itself is API-tested; simulate the completed
      //    link by injecting the pre-created session for the Requester.
      await asSession(context, f!.workspaceA.requesterSession);
      await page.reload({ waitUntil: 'domcontentloaded' });

      // 3. The Requester lands on Ticket creation, not on their ticket list.
      await expect(page.getByTestId('create-ticket')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#ticket-title')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('submit-ticket-btn')).toBeVisible();
      await expect(page.getByTestId('ticket-list')).toHaveCount(0);

      // 4. The destination is consumed: the next visit uses the normal workspace
      //    page instead of redirecting to Ticket creation again.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ticket-list')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('create-ticket')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

// ── Journey C — unknown email feedback (S1) ───────────────────────────────

test.describe('Journey C — unknown email feedback is generic and localized', () => {
  test('unknown email gets the same generic feedback and nothing leaks about memberships', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      const page = await context.newPage();
      await goHome(page);
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });

      await openTicketButton(page).click();
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10_000 });

      const unknownEmail = 'no-such-person@landing-journey.test';
      await page.locator('#email').fill(unknownEmail);
      await page.getByRole('button', { name: 'Send magic link' }).click();

      // Generic, localized feedback: the same "check your inbox" copy a known
      // address gets, and never a technical or membership-revealing message.
      const feedback = page.getByTestId('login-message');
      await expect(feedback).toBeVisible({ timeout: 15_000 });
      await expect(feedback).toHaveText(
        `Magic link sent to ${unknownEmail}. Check your inbox.`,
      );
      await expect(page.getByTestId('login-error')).toHaveCount(0);

      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body).not.toContain('membership');
      expect(body).not.toContain('no workspace');
      expect(body).not.toContain('not found');
    } finally {
      await context.close();
    }
  });
});

// ── Journey D — authenticated visitors keep the existing default pages (S1) ──

test.describe('Journey D — authenticated visitors at / go to their workspace page', () => {
  test('Requester lands on the ticket list', async ({ browser }) => {
    const context = await englishContext(browser);
    try {
      await asSession(context, f!.workspaceA.requesterSession);
      const page = await context.newPage();
      await goHome(page);

      await expect(page.getByTestId('ticket-list')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('landing-page')).toHaveCount(0);
      await expect(page.getByTestId('login-page')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('Agent lands on the queue', async ({ browser }) => {
    const context = await englishContext(browser);
    try {
      await asSession(context, f!.workspaceA.agentSession);
      const page = await context.newPage();
      await goHome(page);

      await expect(page.getByTestId('agent-queue')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('landing-page')).toHaveCount(0);
      await expect(page.getByTestId('login-page')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
