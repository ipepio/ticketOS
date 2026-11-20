import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
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
 * First-run onboarding — browser tests for the Setup seam.
 *
 * Feature specs: docs/specs/first-run-onboarding.md, S2/ONB-02 (dedicated setup
 * shell), S3/ONB-03 (browser defaults and accessibility), S4/ONB-04 (regression
 * and documentation). The tests observe only the browser/Setup interface and the
 * i18n resolver as exposed through `document.documentElement.lang`: no React
 * component state is inspected and no portal module is mocked.
 *
 * There is no way to make the shared, already-configured app report
 * `configured: false` while its fixtures keep their Workspace, so the
 * unconfigured scenarios run against a disposable instance that this file boots
 * itself:
 *
 *   1. it recreates a fixed scratch database (`ticketos_setup_e2e`) on the same
 *      PostgreSQL server the e2e database lives on, mirroring
 *      packages/app/src/routes/setup.test.ts, and
 *   2. it starts the real app from source (`packages/app/src/index.ts` via tsx)
 *      on its own port, serving the already-built portal at `/`.
 *
 * The shared app and the `ticketos_e2e` database are only used by the
 * "configured installation" block, which seeds data through ../src/fixtures.js.
 *
 * Run with:
 *   cd packages/tests && E2E_DATABASE_URL=postgresql://ticketos:ticketos@localhost:15433/ticketos_e2e \
 *     pnpm exec playwright test e2e/first-run-onboarding.spec.ts
 *
 * PLAYWRIGHT_BASE_URL does not select the app under test here: every navigation
 * uses an absolute URL (the scratch instance or the shared configured app), so
 * the file behaves the same whatever the runner's default base URL is.
 */

// ---------------------------------------------------------------------------
// Target applications
// ---------------------------------------------------------------------------

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
if (!E2E_DATABASE_URL || !E2E_DATABASE_URL.includes('ticketos_e2e')) {
  throw new Error(
    'E2E_DATABASE_URL must point to the dedicated ticketos_e2e database',
  );
}

/** Fixed scratch database, mirroring packages/app/src/routes/setup.test.ts. */
const SCRATCH_DATABASE = 'ticketos_setup_e2e';
// CREATE/DROP DATABASE cannot take bind parameters, so these statements spell
// out the fixed identifier literally. Nothing here is user input.
const DROP_SCRATCH_DATABASE_SQL =
  'DROP DATABASE IF EXISTS ticketos_setup_e2e WITH (FORCE)';
const CREATE_SCRATCH_DATABASE_SQL = 'CREATE DATABASE ticketos_setup_e2e';
const SCRATCH_PORT = Number(process.env.E2E_SETUP_PORT ?? 4101);
const SCRATCH_URL = `http://localhost:${SCRATCH_PORT}`;

/** Shared app already running against the seeded `ticketos_e2e` database. */
const CONFIGURED_URL = process.env.E2E_CONFIGURED_URL ?? 'http://localhost:3021';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const TSX_BIN = join(APP_DIR, 'node_modules', '.bin', 'tsx');

/** Email pre-seeded in the scratch database to force a real server-side refusal. */
const TAKEN_ADMIN_EMAIL = 'taken-admin@first-run.test';

function databaseUrl(database: string): string {
  const url = new URL(E2E_DATABASE_URL as string);
  url.pathname = `/${database}`;
  return url.toString();
}

// ---------------------------------------------------------------------------
// Scratch database
// ---------------------------------------------------------------------------

async function recreateScratchDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: databaseUrl('postgres'), max: 1 });
  try {
    // Idempotent on both sides so a crashed run cannot poison the next one.
    await admin.query(DROP_SCRATCH_DATABASE_SQL);
    await admin.query(CREATE_SCRATCH_DATABASE_SQL);
  } finally {
    await admin.end();
  }
}

async function dropScratchDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: databaseUrl('postgres'), max: 1 });
  try {
    await admin.query(DROP_SCRATCH_DATABASE_SQL);
  } finally {
    await admin.end();
  }
}

/** Insert a user whose email collides with the bootstrap submission. */
async function seedTakenAdminEmail(): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl(SCRATCH_DATABASE),
    max: 1,
  });
  try {
    await pool.query(
      'INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
      [TAKEN_ADMIN_EMAIL],
    );
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Scratch application instance
// ---------------------------------------------------------------------------

interface ScratchApp {
  process: ChildProcess;
  output: () => string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScratchApp(): Promise<ScratchApp> {
  const child = spawn(TSX_BIN, ['src/index.ts'], {
    cwd: APP_DIR,
    // Its own process group, so the whole instance can be stopped at once.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(SCRATCH_DATABASE),
      SESSION_SECRET: 'first-run-onboarding-e2e-session-secret-0123456789',
      REPLY_TOKEN_SECRET: 'first-run-onboarding-e2e-reply-secret-0123456789',
      LOG_LEVEL: 'silent',
      HOST: '127.0.0.1',
      PORT: String(SCRATCH_PORT),
      // Keeps the session cookie non-Secure: the scratch instance is plain HTTP.
      PUBLIC_APP_URL: SCRATCH_URL,
      CORS_ORIGIN: SCRATCH_URL,
    },
  });

  let output = '';
  child.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    output += String(chunk);
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `scratch app exited with code ${child.exitCode}: ${output}`,
      );
    }
    try {
      const res = await fetch(`${SCRATCH_URL}/api/setup/status`);
      if (res.ok) {
        const body = (await res.json()) as { configured?: boolean };
        if (body.configured === false) {
          return { process: child, output: () => output };
        }
      }
    } catch {
      // Not listening yet — migrations and app wiring are still running.
    }
    await sleep(250);
  }

  throw new Error(
    `scratch app never reported configured:false at ${SCRATCH_URL}: ${output}`,
  );
}

async function stopScratchApp(app: ScratchApp): Promise<void> {
  const child = app.process;
  if (child.exitCode !== null || child.pid === undefined) return;

  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      child.kill(signal);
    }
  };

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  signalGroup('SIGTERM');
  const forced = await Promise.race([
    exited.then(() => false),
    sleep(10_000).then(() => true),
  ]);
  if (forced) {
    signalGroup('SIGKILL');
    await exited;
  }
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

interface SetupPageOptions {
  locale?: string;
  timezoneId?: string;
  storedLocale?: string;
  initScript?: () => void;
}

interface OpenedSetup {
  context: BrowserContext;
  page: Page;
}

/**
 * Open the unconfigured installation in a fresh browser context.
 *
 * `locale`, `timezoneId`, `Intl.DateTimeFormat` and localStorage are controlled
 * only as browser-environment adapters, as the spec's Testing Decisions allow.
 */
async function openSetupPage(
  browser: Browser,
  options: SetupPageOptions = {},
): Promise<OpenedSetup> {
  const context = await browser.newContext({
    locale: options.locale ?? 'en-US',
    timezoneId: options.timezoneId,
  });
  if (options.storedLocale !== undefined) {
    await context.addInitScript((value: string) => {
      localStorage.setItem('ticketos-locale', value);
    }, options.storedLocale);
  }
  if (options.initScript) {
    await context.addInitScript(options.initScript);
  }
  const page = await context.newPage();
  await page.goto(SCRATCH_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-wizard')).toBeVisible({
    timeout: 30_000,
  });
  return { context, page };
}

// ---------------------------------------------------------------------------
// Unconfigured installation — scratch instance (S2, S3, S4 browser tests)
// ---------------------------------------------------------------------------

test.describe('Unconfigured installation — first-run onboarding', () => {
  let scratch: ScratchApp | undefined;

  test.beforeAll(async () => {
    await recreateScratchDatabase();
    scratch = await startScratchApp();
  });

  test.afterAll(async () => {
    try {
      if (scratch) {
        await stopScratchApp(scratch);
        scratch = undefined;
      }
    } finally {
      await dropScratchDatabase();
    }
  });

  // S2 — "On an unconfigured Installation, DOM/browser tests find the setup form
  // and find no Sidebar, topbar, bottom navigation, “My Tickets”, or “New Ticket”."
  // S2 — "Setup is not implemented as an overlay/modal over the application shell."
  test('unconfigured installation renders the setup experience without the application shell', async ({
    browser,
  }) => {
    const { context, page } = await openSetupPage(browser);
    try {
      await expect(page.getByTestId('setup-wizard')).toBeVisible();

      // No authenticated shell: no Sidebar, topbar, bottom navigation or nav items.
      await expect(page.getByTestId('sidebar')).toHaveCount(0);
      await expect(page.getByTestId('topbar')).toHaveCount(0);
      await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
      await expect(page.getByText('My Tickets')).toHaveCount(0);
      await expect(page.getByText('New Ticket')).toHaveCount(0);

      // Setup owns the page: it is a full-page state, not a modal over a shell.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
      await expect(page.locator('main')).toHaveCount(1);

      const setupBox = await page.getByTestId('setup-wizard').boundingBox();
      const viewport = page.viewportSize();
      expect(setupBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(setupBox!.height).toBeGreaterThan(viewport!.height * 0.8);
      expect(setupBox!.width).toBeGreaterThan(viewport!.width * 0.8);
    } finally {
      await context.close();
    }
  });

  // S3 — "Spanish browser preference renders Spanish setup labels before user input."
  test('Spanish browser preference renders Spanish setup labels before any input', async ({
    browser,
  }) => {
    const { context, page } = await openSetupPage(browser, { locale: 'es-ES' });
    try {
      await expect(
        page.getByRole('heading', { name: 'Configura tu instalación' }),
      ).toBeVisible();
      await expect(page.getByLabel('Nombre del espacio de trabajo')).toBeVisible();
      await expect(page.getByLabel('Correo del administrador')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Crear instalación' }),
      ).toBeVisible();
      await expect(page.getByText('Set up your installation')).toHaveCount(0);
      await expect(page.getByText('Workspace name')).toHaveCount(0);

      // "before user input": the labels are Spanish while the form is still empty.
      await expect(page.locator('#ws-name')).toHaveValue('');
      await expect(page.locator('#admin-email')).toHaveValue('');
    } finally {
      await context.close();
    }
  });

  // S3 — "The timezone selector defaults to the browser timezone when available."
  test('timezone selector defaults to the browser timezone', async ({ browser }) => {
    const { context, page } = await openSetupPage(browser, {
      timezoneId: 'America/Bogota',
    });
    try {
      const selector = page.locator('#timezone');
      await expect(selector).toHaveValue('America/Bogota');
      // The preselected value must be a real option, not an empty select.
      await expect(page.getByLabel('Timezone')).toHaveValue('America/Bogota');
    } finally {
      await context.close();
    }
  });

  // S3 — the documented UTC fallback when the browser cannot report a timezone.
  test('timezone selector falls back to UTC when the browser reports none', async ({
    browser,
  }) => {
    const { context, page } = await openSetupPage(browser, {
      timezoneId: 'Europe/Madrid',
      initScript: () => {
        const original = Intl.DateTimeFormat.prototype.resolvedOptions;
        Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions(
          this: Intl.DateTimeFormat,
        ) {
          const resolved = original.call(this);
          return { ...resolved, timeZone: undefined } as unknown as typeof resolved;
        } as typeof original;
      },
    });
    try {
      await expect(page.locator('#timezone')).toHaveValue('UTC');
      // The adapter really removed the browser timezone: UTC comes from the fallback.
      expect(
        await page.evaluate(
          () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
      ).toBeUndefined();
    } finally {
      await context.close();
    }
  });

  // S3 — "The first required field receives focus and all required fields have labels."
  test('first required field is focused and every field is labelled', async ({
    browser,
  }) => {
    const { context, page } = await openSetupPage(browser);
    try {
      await expect(page.locator('#ws-name')).toBeFocused();

      const fields: Array<[string, string, boolean]> = [
        ['ws-name', 'Workspace name', true],
        ['admin-email', 'Admin email', true],
        ['admin-name', 'Your name', false],
        ['timezone', 'Timezone', false],
      ];
      for (const [id, label, required] of fields) {
        await expect(page.locator(`label[for="${id}"]`)).toContainText(label);
        await expect(page.getByLabel(label)).toHaveCount(1);
        if (required) {
          await expect(page.locator(`#${id}`)).toHaveAttribute('required', '');
        }
      }
    } finally {
      await context.close();
    }
  });

  // S3 — "Submission failure is announced once and does not lose entered values."
  // The failure is produced by the real Setup HTTP adapter: the bootstrap is
  // rejected because the submitted admin email already exists in the scratch
  // installation.
  test('server-side submission failure is announced once and keeps entered values', async ({
    browser,
  }) => {
    await seedTakenAdminEmail();
    const { context, page } = await openSetupPage(browser);
    try {
      await page.locator('#ws-name').fill('Colliding Workspace');
      await page.locator('#admin-email').fill(TAKEN_ADMIN_EMAIL);
      await page.locator('#admin-name').fill('Ada Lovelace');
      await page.getByRole('button', { name: 'Create installation' }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText('Bootstrap failed');
      await expect(alert).toHaveCount(1);

      // Announced once: it stays a single alert while the form is still usable.
      await sleep(500);
      await expect(page.getByRole('alert')).toHaveCount(1);

      // Entered values survive the failed submission.
      await expect(page.locator('#ws-name')).toHaveValue('Colliding Workspace');
      await expect(page.locator('#admin-email')).toHaveValue(TAKEN_ADMIN_EMAIL);
      await expect(page.locator('#admin-name')).toHaveValue('Ada Lovelace');
      await expect(page.getByTestId('setup-wizard')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  // S4 — browser coverage for S1's locale precedence, `document.documentElement.lang`
  // and persistence across reload, observed at the i18n resolver seam only.
  test('stored locale wins over the browser and locale changes persist for reload', async ({
    browser,
  }) => {
    // A stored `ticketos-locale=es` wins over a browser that prefers English.
    const stored = await openSetupPage(browser, {
      locale: 'en-US',
      storedLocale: 'es',
    });
    try {
      await expect(
        stored.page.getByRole('heading', { name: 'Configura tu instalación' }),
      ).toBeVisible();
      await expect(stored.page.locator('html')).toHaveAttribute('lang', 'es');
    } finally {
      await stored.context.close();
    }

    // A Spanish regional browser preference selects Spanish with nothing stored…
    const regional = await openSetupPage(browser, { locale: 'es-MX' });
    try {
      await expect(
        regional.page.getByRole('heading', { name: 'Configura tu instalación' }),
      ).toBeVisible();
      await expect(regional.page.locator('html')).toHaveAttribute('lang', 'es');
    } finally {
      await regional.context.close();
    }

    // …and an explicit locale change updates `html.lang` and persists for reload.
    const switched = await openSetupPage(browser, { locale: 'en-US' });
    try {
      await expect(
        switched.page.getByRole('heading', { name: 'Set up your installation' }),
      ).toBeVisible();
      await expect(switched.page.locator('html')).toHaveAttribute('lang', 'en');

      await switched.page.getByTestId('locale-switcher').selectOption('es');
      await expect(
        switched.page.getByRole('heading', { name: 'Configura tu instalación' }),
      ).toBeVisible();
      await expect(switched.page.locator('html')).toHaveAttribute('lang', 'es');
      expect(
        await switched.page.evaluate(() =>
          localStorage.getItem('ticketos-locale'),
        ),
      ).toBe('es');

      await switched.page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        switched.page.getByRole('heading', { name: 'Configura tu instalación' }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(switched.page.locator('html')).toHaveAttribute('lang', 'es');
    } finally {
      await switched.context.close();
    }
  });

  // S4 — "keyboard path" plus S2 — "A successful setup does not leave stale setup
  // navigation visible after reload." This is the only test that configures the
  // scratch installation, so it runs last.
  test('setup completes with the keyboard only and leaves no stale setup navigation after reload', async ({
    browser,
  }) => {
    const { context, page } = await openSetupPage(browser);
    try {
      await expect(page.locator('#ws-name')).toBeFocused();

      // Keyboard only: Tab, type, Enter — no mouse, no locator.fill/click.
      await page.keyboard.type('Keyboard Workspace');
      await page.keyboard.press('Tab');
      await page.keyboard.type('keyboard-admin@first-run.test');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Keyboard Admin');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Create installation' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');

      // The real bootstrap sets the session cookie and reloads into the shell.
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('setup-wizard')).toHaveCount(0);
      await expect(page.getByTestId('topbar')).toBeVisible();
      await expect(
        page.getByTestId('sidebar').getByRole('button', { name: 'My Tickets' }),
      ).toBeVisible();

      // S2 — reload: a configured installation keeps the shell and no setup UI.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('setup-wizard')).toHaveCount(0);
      await expect(page.locator('#ws-name')).toHaveCount(0);
      // Bottom navigation exists in the shell DOM (hidden by CSS on desktop).
      await expect(page.getByTestId('bottom-nav')).toBeAttached();
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Configured installation — shared app + seeded fixtures (S2)
// ---------------------------------------------------------------------------

test.describe('Configured installation — no setup form, normal session behavior', () => {
  let fixtures: TestFixtures | undefined;

  test.beforeAll(async () => {
    fixtures = await setupFixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await teardownFixtures(fixtures);
      fixtures = undefined;
    }
  });

  // S2 — "On a configured Installation, the setup form is not rendered and normal
  // authentication/session behavior remains available."
  test('setup form is not rendered and unauthenticated visitors get the login page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    try {
      const page = await context.newPage();
      await page.goto(CONFIGURED_URL, { waitUntil: 'domcontentloaded' });

      await expect(page.getByTestId('login-page')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByTestId('setup-wizard')).toHaveCount(0);
      await expect(page.locator('#ws-name')).toHaveCount(0);
      await expect(page.getByTestId('sidebar')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  // S2 — session restore on a configured installation still opens the shell.
  test('session restore renders the authenticated shell without the setup form', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    try {
      await context.addCookies([
        {
          name: 'sessionId',
          value: fixtures!.workspaceA.adminSession,
          domain: new URL(CONFIGURED_URL).hostname,
          path: '/',
        },
      ]);
      const page = await context.newPage();
      await page.goto(CONFIGURED_URL, { waitUntil: 'domcontentloaded' });

      await expect(page.getByTestId('sidebar')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('setup-wizard')).toHaveCount(0);
      await expect(page.locator('#ws-name')).toHaveCount(0);
      await expect(
        page.getByTestId('sidebar').getByRole('button', { name: 'My Tickets' }),
      ).toBeVisible();
      await expect(page.getByTestId('agent-queue')).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });
});
