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
 * Organizations and Workspace Memberships — browser journeys for F3 (S3) and
 * TDD slice 17.
 *
 * Feature specs: docs/specs/operational-portal-completion.md
 *   - "A Workspace Admin can list and create Organizations."
 *   - "A Workspace Admin can add, edit, activate, and deactivate Workspace
 *     Memberships."
 *   - "External members use the Requester role and may belong to an
 *     Organization."
 *   - "Adding an external member makes their email eligible for magic-link
 *     login."
 *   - Slice 17: "An external Requester added by a Workspace Admin can request a
 *     magic link."
 *
 * The seam is the browser: every mutation is performed through the portal's own
 * controls and observed as rendered UI. Only the two facts a browser cannot
 * show — the stored Magic Link and the stored Membership row — are read from
 * the database, never mutated.
 *
 * Cross-Workspace denial is already covered by admin-config.spec.ts Journey C
 * and is not duplicated here.
 */

let f: TestFixtures | undefined;

test.beforeAll(async () => { f = await setupFixtures(); });
test.afterAll(async () => { if (f) await teardownFixtures(f); });

// ── Browser helpers ───────────────────────────────────────────────────────

/** Every journey in this file runs in English. */
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

/** Open one of the Workspace Admin pages through the sidebar, like an admin would. */
async function openAdminPage(page: Page, label: string, testId: string): Promise<void> {
  const sidebar = page.getByTestId('sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
  await sidebar.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 10_000 });
}

/** The Member row for an address, addressed the way an admin reads it. */
function memberRow(page: Page, email: string) {
  return page.getByRole('row', { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

/** Create an Organization through the Organizations page and return its name. */
async function createOrganization(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ New organization' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create organization' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}

interface NewMember {
  email: string;
  name: string;
  organization?: string;
}

/** Add an external Requester through the Members page, as a Workspace Admin would. */
async function addExternalMember(page: Page, member: NewMember): Promise<void> {
  await page.getByRole('button', { name: '+ Add member' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel('Email').fill(member.email);
  await dialog.getByLabel('Name').fill(member.name);
  await dialog.getByLabel('Role').selectOption('requester');
  if (member.organization) {
    await dialog.getByLabel('Organization').selectOption({ label: member.organization });
  }
  await dialog.getByRole('button', { name: 'Add and grant access' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  // The new membership exists and is usable without another refresh.
  const row = memberRow(page, member.email);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByRole('button', { name: 'Active' })).toBeVisible();
}

// ── Journey A — Organizations ─────────────────────────────────────────────

test.describe('Journey A — a Workspace Admin lists and creates Organizations', () => {
  test('admin creates an Organization through the sidebar and sees it in the list', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      await asSession(context, f!.workspaceA.adminSession);
      const page = await context.newPage();
      await goHome(page);

      // 1. Sidebar → Organizations.
      await openAdminPage(page, 'Organizations', 'organizations-page');
      await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();

      // 2. Create one through the dialog.
      const name = `Acme Support ${Date.now()}`;
      await createOrganization(page, name);

      // 3. It is listed with no external members yet.
      const row = page.getByRole('row', { name: new RegExp(name) });
      await expect(row.getByRole('cell').nth(1)).toHaveText('0');

      // 4. The Organization is stored, not just echoed in the table.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openAdminPage(page, 'Organizations', 'organizations-page');
      await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

// ── Journey B — external members ──────────────────────────────────────────

test.describe('Journey B — a Workspace Admin adds an external Requester', () => {
  test('admin adds a Requester, optionally assigned to an Organization, and the membership persists', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      await asSession(context, f!.workspaceA.adminSession);
      const page = await context.newPage();
      await goHome(page);

      // An Organization to assign the external member to.
      await openAdminPage(page, 'Organizations', 'organizations-page');
      const organization = `External Partners ${Date.now()}`;
      await createOrganization(page, organization);

      // 1. Sidebar → Members.
      await openAdminPage(page, 'Members', 'members-page');
      await expect(page.getByRole('heading', { name: 'Workspace Members' })).toBeVisible();

      // 2. Add an external member with the Requester role and that Organization.
      const email = `external-${Date.now()}@members-journey.test`;
      await addExternalMember(page, { email, name: 'External Requester', organization });

      // 3. The row records S3's external-member shape: Requester role, the chosen
      //    Organization, and an active membership.
      const row = memberRow(page, email);
      const selects = row.getByRole('combobox');
      await expect(selects.nth(0)).toHaveValue('requester');
      await expect(selects.nth(1).locator('option:checked')).toHaveText(organization);
      await expect(row.getByRole('button', { name: 'Active' })).toBeVisible();

      // 4. The membership survives a reload and shows up in the external filter.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openAdminPage(page, 'Members', 'members-page');
      await page.getByRole('button', { name: 'External members' }).click();
      const reloaded = memberRow(page, email);
      await expect(reloaded).toBeVisible();
      await expect(reloaded.getByRole('combobox').nth(0)).toHaveValue('requester');
    } finally {
      await context.close();
    }
  });
});

// ── Journey C — edit, deactivate, re-activate ─────────────────────────────

test.describe('Journey C — a Workspace Admin edits, deactivates and re-activates a membership', () => {
  test('role edit, deactivation and re-activation are all visible and stored', async ({
    browser,
  }) => {
    const context = await englishContext(browser);
    try {
      await asSession(context, f!.workspaceA.adminSession);
      const page = await context.newPage();
      await goHome(page);

      await openAdminPage(page, 'Members', 'members-page');
      const email = `editable-${Date.now()}@members-journey.test`;
      await addExternalMember(page, { email, name: 'Editable Requester' });

      // 1. Edit: change the membership role from Requester to Agent.
      const roleSelect = memberRow(page, email).getByRole('combobox').nth(0);
      await roleSelect.selectOption('agent');
      await expect(memberRow(page, email).getByRole('combobox').nth(0)).toHaveValue('agent');

      // 2. The edit is stored.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openAdminPage(page, 'Members', 'members-page');
      await expect(memberRow(page, email).getByRole('combobox').nth(0)).toHaveValue('agent');

      // 3. Deactivate through the status control in the row.
      const activeRow = memberRow(page, email);
      await activeRow.getByRole('button', { name: 'Active' }).click();
      await expect(memberRow(page, email).getByRole('button', { name: 'Inactive' })).toBeVisible();

      // 4. The deactivation is stored.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openAdminPage(page, 'Members', 'members-page');
      await expect(memberRow(page, email).getByRole('button', { name: 'Inactive' })).toBeVisible();

      // 5. Re-activation restores the active membership.
      await memberRow(page, email).getByRole('button', { name: 'Inactive' }).click();
      await expect(memberRow(page, email).getByRole('button', { name: 'Active' })).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await openAdminPage(page, 'Members', 'members-page');
      await expect(memberRow(page, email).getByRole('button', { name: 'Active' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

// ── Journey D — slice 17: an added external Requester can request a magic link ──

test.describe('Journey D — slice 17: an added external Requester can request a magic link', () => {
  test('the newly added Requester requests a link and gets the same generic answer as any address', async ({
    browser,
  }) => {
    // 1. The Workspace Admin adds the external Requester through the portal.
    const email = `slice17-${Date.now()}@members-journey.test`;
    const adminContext = await englishContext(browser);
    try {
      await asSession(adminContext, f!.workspaceA.adminSession);
      const adminPage = await adminContext.newPage();
      await goHome(adminPage);
      await openAdminPage(adminPage, 'Members', 'members-page');
      await addExternalMember(adminPage, { email, name: 'Slice Seventeen Requester' });
    } finally {
      await adminContext.close();
    }

    // 2. The new member — who never signed in before — asks for a magic link
    //    through the login form, exactly as the landing journey does.
    const visitorContext = await englishContext(browser);
    try {
      const page = await visitorContext.newPage();
      await goHome(page);
      await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('open-ticket-btn').click();
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10_000 });

      await page.locator('#email').fill(email);
      const [response] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/auth/magic-link')),
        page.getByRole('button', { name: 'Send magic link' }).click(),
      ]);

      // 3. S1 keeps the answer generic for every address: an eligible address
      //    gets the same 200 body as an unknown one, never a delivery error.
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ message: 'Magic link sent' });

      const feedback = page.getByTestId('login-message');
      await expect(feedback).toBeVisible({ timeout: 15_000 });
      await expect(feedback).toHaveText(`Magic link sent to ${email}. Check your inbox.`);
      await expect(page.getByTestId('login-error')).toHaveCount(0);

      // 4. The link was really issued for this email in the admin's Workspace.
      const { rows } = await f!.pool.query(
        `SELECT ml.workspace_id, ml.used_at, ml.expires_at > NOW() AS fresh
           FROM magic_links ml
           JOIN users u ON u.id = ml.user_id
          WHERE u.email = $1`,
        [email],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].workspace_id).toBe(f!.workspaceA.id);
      expect(rows[0].used_at).toBeNull();
      expect(rows[0].fresh).toBe(true);
    } finally {
      await visitorContext.close();
    }
  });
});
