import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  test,
  expect,
  request as pwRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  setupFixtures,
  teardownFixtures,
  seedWorkspaces,
  type TestFixtures,
  type TestWorkspace,
} from '../src/fixtures.js';

/**
 * Attachments — HTTP and browser journeys for F8 (S1) and TDD slices 11–13.
 *
 * Feature specs: docs/specs/operational-portal-completion.md
 *   - S1: "A permitted User can add one or more Attachments to a Ticket."
 *   - S1: "The server validates size, content type, blocked extensions, Ticket
 *     access, and Workspace scope."
 *   - S1: "Attachment metadata and object lifecycle remain consistent if upload
 *     fails."
 *   - S1: "Download uses an authorized endpoint or short-lived authorized URL;
 *     never a permanent public URL."
 *   - S1: "Requesters cannot access Attachments belonging only to Internal
 *     Notes."
 *   - S3 slice 11: "A Requester uploads and downloads an Attachment through
 *     local storage."
 *   - S3 slice 12: "An unauthorized User cannot download that Attachment."
 *   - S3 slice 13: "The same upload/download example passes against MinIO."
 *     (In this repository the development S3 service is SeaweedFS — the owner's
 *     decision recorded in odd/tasks/attachments-storage.md, L3 — and the S3
 *     gateway speaks the same protocol the adapter targets.)
 *
 * Slices 11, 12 and the validation rejections run against the shared app on
 * PLAYWRIGHT_BASE_URL (LOCAL storage). Slice 13 boots a disposable instance of
 * the same app from source, on its own port and its own scratch database, with
 * ATTACHMENT_STORAGE_ADAPTER=s3 pointed at the development S3 gateway.
 *
 * Every assertion about "no orphaned object" is made against a directory or a
 * database this file owns: the scratch instance's local volume is a temp
 * directory, so a rejected upload that wrote anything there is visible.
 */

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
if (!E2E_DATABASE_URL || !E2E_DATABASE_URL.includes('ticketos_e2e')) {
  throw new Error(
    'E2E_DATABASE_URL must point to the dedicated ticketos_e2e database',
  );
}

/** Shared app already running against the seeded `ticketos_e2e` database. */
const SHARED_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3021';

/** Fixed scratch database, mirroring first-run-onboarding.spec.ts. */
const SCRATCH_DATABASE = 'ticketos_storage_e2e';
// CREATE/DROP DATABASE cannot take bind parameters, so these statements spell
// out the fixed identifier literally. Nothing here is user input.
const DROP_SCRATCH_DATABASE_SQL = 'DROP DATABASE IF EXISTS ticketos_storage_e2e WITH (FORCE)';
const CREATE_SCRATCH_DATABASE_SQL = 'CREATE DATABASE ticketos_storage_e2e';
const SCRATCH_PORT = Number(process.env.E2E_STORAGE_PORT ?? 4201);
const SCRATCH_URL = `http://localhost:${SCRATCH_PORT}`;

/** The development S3-compatible gateway (docker compose service `seaweedfs`). */
const S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9100';
const S3_BUCKET = 'ticketos-attachments-e2e';

/**
 * Upload limit asserted by the journeys. The route's own limit is the authority;
 * this constant is the contract the journeys hold it to.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const TSX_BIN = join(APP_DIR, 'node_modules', '.bin', 'tsx');

function databaseUrl(database: string): string {
  const url = new URL(E2E_DATABASE_URL as string);
  url.pathname = `/${database}`;
  return url.toString();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * The multipart contexts deliberately carry no default Content-Type: the browser
 * and Playwright must set their own `multipart/form-data; boundary=…`. The
 * suite-wide `use.extraHTTPHeaders` JSON header is cleared here explicitly —
 * left in place it would make Fastify parse a file body as JSON.
 */
async function multipartContext(baseUrl: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: baseUrl, extraHTTPHeaders: {} });
}

async function createTicket(
  api: APIRequestContext,
  workspace: TestWorkspace,
  title: string,
): Promise<string> {
  const res = await api.post('/api/tickets', {
    data: { title, ticketTypeId: workspace.ticketTypeId, priorityId: workspace.priorityId },
    headers: { Cookie: `sessionId=${workspace.requesterSession}` },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function uploadAttachment(
  api: APIRequestContext,
  ticketId: string,
  sessionId: string,
  file: UploadFile,
  fields: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const res = await api.post(`/api/tickets/${ticketId}/attachments`, {
    multipart: {
      ...fields,
      file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer },
    },
    headers: { Cookie: `sessionId=${sessionId}` },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

function downloadAttachment(
  api: APIRequestContext,
  ticketId: string,
  attachmentId: string,
  sessionId: string,
) {
  return api.get(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
    headers: { Cookie: `sessionId=${sessionId}` },
  });
}

async function listAttachments(
  api: APIRequestContext,
  ticketId: string,
  sessionId: string,
): Promise<{ status: number; body: any }> {
  const res = await api.get(`/api/tickets/${ticketId}/attachments`, {
    headers: { Cookie: `sessionId=${sessionId}` },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function attachmentRows(
  pool: Pool,
  ticketId: string,
): Promise<{ id: string; storage_key: string | null; size: string; visibility: string }[]> {
  const { rows } = await pool.query(
    'SELECT id, storage_key, size, visibility FROM attachments WHERE ticket_id = $1 ORDER BY created_at',
    [ticketId],
  );
  return rows;
}

/**
 * One full upload + download round trip, asserted at the public seam.
 * Returns the created Attachment as the server reported it.
 */
async function assertRoundTrip(
  api: APIRequestContext,
  workspace: TestWorkspace,
  ticketId: string,
  label: string,
): Promise<{ id: string; filename: string }> {
  const bytes = Buffer.from(`attachment journey ${label}: ${'0123456789'.repeat(32)}`);
  const filename = `journey-${label}.txt`;

  const uploaded = await uploadAttachment(api, ticketId, workspace.requesterSession, {
    name: filename,
    mimeType: 'text/plain',
    buffer: bytes,
  });
  expect(uploaded.status).toBe(201);
  expect(uploaded.body).toMatchObject({
    ticketId,
    filename,
    mimeType: 'text/plain',
    size: bytes.byteLength,
    visibility: 'public',
  });
  expect(uploaded.body.id).toBeTruthy();

  // Download: authorized endpoint, identical bytes, stored content type.
  const download = await downloadAttachment(
    api,
    ticketId,
    uploaded.body.id,
    workspace.requesterSession,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toContain('text/plain');
  expect(Buffer.compare(await download.body(), bytes)).toBe(0);

  // The Attachment is listed for the same reader.
  const listed = await listAttachments(api, ticketId, workspace.requesterSession);
  expect(listed.status).toBe(200);
  const ids = (listed.body as { id: string }[]).map((a) => a.id);
  expect(ids).toContain(uploaded.body.id);

  return { id: uploaded.body.id, filename };
}

// ---------------------------------------------------------------------------
// Scratch S3 instance
// ---------------------------------------------------------------------------

interface ScratchApp {
  process: ChildProcess;
  localDir: string;
  output: () => string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Boot the real app from source with the S3 adapter selected.
 *
 * The local Attachment volume is pointed at a fresh temp directory outside the
 * worktree: slice 13 must prove the objects went to S3, so any local write would
 * be an invariant S4 violation ("a configured S3 adapter must never silently
 * fall back to local storage").
 */
async function startScratchS3App(): Promise<ScratchApp> {
  const localDir = await mkdtemp(join(tmpdir(), 'ticketos-s3-e2e-'));

  const child = spawn(TSX_BIN, ['src/index.ts'], {
    cwd: APP_DIR,
    // Its own process group, so the whole instance can be stopped at once.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(SCRATCH_DATABASE),
      ATTACHMENT_STORAGE_ADAPTER: 's3',
      ATTACHMENT_S3_BUCKET: S3_BUCKET,
      ATTACHMENT_S3_REGION: 'us-east-1',
      ATTACHMENT_S3_ENDPOINT: S3_ENDPOINT,
      ATTACHMENT_S3_ACCESS_KEY_ID: 'ticketos',
      ATTACHMENT_S3_SECRET_ACCESS_KEY: 'ticketos-dev-secret',
      ATTACHMENT_S3_FORCE_PATH_STYLE: 'true',
      ATTACHMENT_LOCAL_DIR: localDir,
      SESSION_SECRET: 'attachments-s3-e2e-session-secret-0123456789',
      REPLY_TOKEN_SECRET: 'attachments-s3-e2e-reply-secret-0123456789',
      LOG_LEVEL: 'silent',
      HOST: '127.0.0.1',
      PORT: String(SCRATCH_PORT),
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
      throw new Error(`scratch S3 app exited with code ${child.exitCode}: ${output}`);
    }
    try {
      const res = await fetch(`${SCRATCH_URL}/ready`);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === 'ok') return { process: child, localDir, output: () => output };
      }
    } catch {
      // Not listening yet — migrations and bucket initialization are still running.
    }
    await sleep(250);
  }

  throw new Error(`scratch S3 app never became ready at ${SCRATCH_URL}: ${output}`);
}

async function stopScratchApp(app: ScratchApp | undefined): Promise<void> {
  if (!app) return;
  const child = app.process;
  if (child.exitCode === null && child.pid !== undefined) {
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
  await rm(app.localDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Shared app journeys — slices 11, 12, validation, Internal-Note isolation
// ---------------------------------------------------------------------------

let f: TestFixtures | undefined;
let api: APIRequestContext | undefined;

test.beforeAll(async () => {
  f = await setupFixtures();
  api = await multipartContext(SHARED_URL);
});

test.afterAll(async () => {
  if (api) await api.dispose();
  if (f) await teardownFixtures(f);
});

test.describe('Slice 11 — a Requester uploads and downloads an Attachment', () => {
  test('upload, download and list round trip through the HTTP seam', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Attachment round trip');
    const attachment = await assertRoundTrip(api!, f!.workspaceA, ticketId, 'local');

    // Metadata and object are consistent: one available row carrying a key.
    const rows = await attachmentRows(f!.pool, ticketId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(attachment.id);
    expect(rows[0]!.storage_key).toBeTruthy();
    expect(Number(rows[0]!.size)).toBeGreaterThan(0);
  });

  test('an Agent may attach to a Ticket another User created', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Second attachment author');
    const bytes = Buffer.from('agent upload');
    const uploaded = await uploadAttachment(api!, ticketId, f!.workspaceA.agentSession, {
      name: 'agent-note.txt',
      mimeType: 'text/plain',
      buffer: bytes,
    });
    expect(uploaded.status).toBe(201);

    const download = await downloadAttachment(
      api!,
      ticketId,
      uploaded.body.id,
      f!.workspaceA.requesterSession,
    );
    expect(download.status()).toBe(200);
    expect(Buffer.compare(await download.body(), bytes)).toBe(0);
  });
});

test.describe('PRESERVE — GET /api/tickets keeps its assignee filter', () => {
  // The Attachments work changed this route's default filter: it used to pass
  // `assignedTo: null` when the query said nothing, which compared
  // `assigned_to = NULL` and hid every unassigned Ticket from the portal. The
  // option itself must keep narrowing the list when it *is* supplied.
  test('an explicit ?assignedTo= narrows the list to that Agent', async () => {
    const assigned = await createTicket(api!, f!.workspaceA, 'List filter assigned');
    const other = await createTicket(api!, f!.workspaceA, 'List filter unassigned');

    const unfiltered = await api!.get('/api/tickets', {
      headers: { Cookie: `sessionId=${f!.workspaceA.agentSession}` },
    });
    expect(unfiltered.status()).toBe(200);
    const all = (await unfiltered.json()) as { id: string }[];
    expect(all.map((t) => t.id)).toEqual(expect.arrayContaining([assigned, other]));

    const claim = await api!.post(`/api/tickets/${assigned}/claim`, {
      headers: { Cookie: `sessionId=${f!.workspaceA.agentSession}` },
    });
    expect(claim.status()).toBe(200);

    const filtered = await api!.get(
      `/api/tickets?assignedTo=${f!.workspaceA.agentUserId}`,
      { headers: { Cookie: `sessionId=${f!.workspaceA.agentSession}` } },
    );
    expect(filtered.status()).toBe(200);
    expect(((await filtered.json()) as { id: string }[]).map((t) => t.id)).toEqual([assigned]);
  });
});

test.describe('Slice 12 — an unauthorized User cannot download the Attachment', () => {
  test('cross-Workspace Requester gets no bytes', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Cross workspace attachment');
    const bytes = Buffer.from('secret for workspace A only');
    const uploaded = await uploadAttachment(api!, ticketId, f!.workspaceA.requesterSession, {
      name: 'workspace-a-only.txt',
      mimeType: 'text/plain',
      buffer: bytes,
    });
    expect(uploaded.status).toBe(201);

    // B's Requester cannot reach the Attachment through A's Ticket.
    const denied = await downloadAttachment(
      api!,
      ticketId,
      uploaded.body.id,
      f!.workspaceB.requesterSession,
    );
    expect([403, 404]).toContain(denied.status());
    expect((await denied.body()).toString()).not.toContain('secret for workspace A only');

    // Nor through B's own Ticket id with A's Attachment id ("wrong-workspace
    // attachment id"): the pair is not resolvable.
    const foreignTicket = await createTicket(api!, f!.workspaceB, 'Foreign attachment id');
    const mismatched = await downloadAttachment(
      api!,
      foreignTicket,
      uploaded.body.id,
      f!.workspaceB.requesterSession,
    );
    expect([403, 404]).toContain(mismatched.status());

    // An unauthenticated caller gets nothing either.
    const anonymous = await api!.get(`/api/tickets/${ticketId}/attachments/${uploaded.body.id}`);
    expect(anonymous.status()).toBe(401);
  });
});

test.describe('S1 — Internal-Note Attachments are invisible to Requesters', () => {
  test('an internal Attachment is listed and downloadable for Agents only', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Internal note attachment');
    const bytes = Buffer.from('internal only payload');
    const uploaded = await uploadAttachment(
      api!,
      ticketId,
      f!.workspaceA.agentSession,
      { name: 'internal-note.txt', mimeType: 'text/plain', buffer: bytes },
      { visibility: 'internal' },
    );
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.visibility).toBe('internal');

    // Requester: not listed, not downloadable.
    const requesterList = await listAttachments(api!, ticketId, f!.workspaceA.requesterSession);
    expect(requesterList.status).toBe(200);
    expect((requesterList.body as { id: string }[]).map((a) => a.id)).not.toContain(
      uploaded.body.id,
    );

    const requesterDownload = await downloadAttachment(
      api!,
      ticketId,
      uploaded.body.id,
      f!.workspaceA.requesterSession,
    );
    expect([403, 404]).toContain(requesterDownload.status());

    // Agent: listed and downloadable.
    const agentList = await listAttachments(api!, ticketId, f!.workspaceA.agentSession);
    expect((agentList.body as { id: string }[]).map((a) => a.id)).toContain(uploaded.body.id);

    const agentDownload = await downloadAttachment(
      api!,
      ticketId,
      uploaded.body.id,
      f!.workspaceA.agentSession,
    );
    expect(agentDownload.status()).toBe(200);
    expect(Buffer.compare(await agentDownload.body(), bytes)).toBe(0);
  });

  test('a Requester cannot create an internal Attachment', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Requester internal attachment');
    const rejected = await uploadAttachment(
      api!,
      ticketId,
      f!.workspaceA.requesterSession,
      { name: 'sneaky.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
      { visibility: 'internal' },
    );
    expect(rejected.status).toBe(403);
    expect(await attachmentRows(f!.pool, ticketId)).toHaveLength(0);
  });
});

test.describe('S1 — upload validation rejects without leaving metadata or objects', () => {
  test('an upload above the size limit is rejected and stores nothing', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Oversize attachment');
    const oversize = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x61);
    const rejected = await uploadAttachment(api!, ticketId, f!.workspaceA.requesterSession, {
      name: 'too-big.txt',
      mimeType: 'text/plain',
      buffer: oversize,
    });
    expect(rejected.status).toBe(413);
    expect(rejected.body?.code).toBe('file-too-large');
    expect(await attachmentRows(f!.pool, ticketId)).toHaveLength(0);

    const list = await listAttachments(api!, ticketId, f!.workspaceA.requesterSession);
    expect(list.body).toEqual([]);
  });

  test('an upload exactly at the size limit is accepted (boundary)', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Boundary size attachment');
    const atLimit = Buffer.alloc(MAX_UPLOAD_BYTES, 0x62);
    const accepted = await uploadAttachment(api!, ticketId, f!.workspaceA.requesterSession, {
      name: 'at-limit.bin',
      mimeType: 'application/octet-stream',
      buffer: atLimit,
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.size).toBe(MAX_UPLOAD_BYTES);

    const download = await downloadAttachment(
      api!,
      ticketId,
      accepted.body.id,
      f!.workspaceA.requesterSession,
    );
    expect(download.status()).toBe(200);
    expect((await download.body()).byteLength).toBe(MAX_UPLOAD_BYTES);
  });

  test('a blocked extension is rejected regardless of its content type', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Blocked extension attachment');
    const rejected = await uploadAttachment(api!, ticketId, f!.workspaceA.requesterSession, {
      name: 'invoice.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake executable'),
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body?.code).toBe('blocked-extension');
    expect(await attachmentRows(f!.pool, ticketId)).toHaveLength(0);
  });

  test('a blocked content type is rejected even with a harmless filename', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Blocked content type attachment');
    const rejected = await uploadAttachment(api!, ticketId, f!.workspaceA.requesterSession, {
      name: 'harmless.txt',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ fake executable'),
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body?.code).toBe('blocked-content-type');
    expect(await attachmentRows(f!.pool, ticketId)).toHaveLength(0);
  });

  test('an upload without a session is rejected', async () => {
    const ticketId = await createTicket(api!, f!.workspaceA, 'Anonymous attachment');
    const res = await api!.post(`/api/tickets/${ticketId}/attachments`, {
      multipart: {
        file: { name: 'anon.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
      },
    });
    expect(res.status()).toBe(401);
    expect(await attachmentRows(f!.pool, ticketId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Browser journey — the reply-box Attach control (portal wiring)
// ---------------------------------------------------------------------------

async function englishContext(browser: Browser): Promise<BrowserContext> {
  // The suite-wide `use.extraHTTPHeaders` JSON Content-Type applies to browser
  // requests too. A real browser sends multipart/form-data for a file input, so
  // the header is cleared here; otherwise the upload body is parsed as JSON.
  const context = await browser.newContext({ extraHTTPHeaders: {} });
  await context.addInitScript(() => {
    localStorage.setItem('ticketos-locale', 'en');
  });
  return context;
}

async function asSession(context: BrowserContext, sessionId: string): Promise<void> {
  const url = new URL(SHARED_URL);
  await context.addCookies([
    { name: 'sessionId', value: sessionId, domain: url.hostname, path: '/' },
  ]);
}

test.describe('Portal — the reply-box Attach control uploads and links', () => {
  test('a Requester attaches a file from the Ticket detail and can download it', async ({
    browser,
  }) => {
    // Slice 11's journeyman: the Requester who owns the Ticket, through the real UI.
    const ticketId = await createTicket(api!, f!.workspaceA, 'Portal attach journey');

    const context = await englishContext(browser);
    await asSession(context, f!.workspaceA.requesterSession);
    const page: Page = await context.newPage();
    await page.goto(SHARED_URL, { waitUntil: 'domcontentloaded' });

    await page.getByTestId(`open-ticket-${ticketId}`).click();
    await expect(page.getByTestId('ticket-detail')).toBeVisible({ timeout: 15_000 });

    const bytes = Buffer.from('portal upload bytes');
    await page.getByTestId('attach-input').setInputFiles({
      name: 'portal-note.txt',
      mimeType: 'text/plain',
      buffer: bytes,
    });

    const item = page.getByTestId('attachment-item').filter({ hasText: 'portal-note.txt' });
    await expect(item).toBeVisible({ timeout: 15_000 });

    const downloadHref = await item.getByTestId('attachment-download').getAttribute('href');
    expect(downloadHref).toBeTruthy();
    expect(downloadHref).toContain(`/api/tickets/${ticketId}/attachments/`);

    const download = await api!.get(downloadHref!, {
      headers: { Cookie: `sessionId=${f!.workspaceA.requesterSession}` },
    });
    expect(download.status()).toBe(200);
    expect(Buffer.compare(await download.body(), bytes)).toBe(0);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Slice 13 — the same journey against S3 (SeaweedFS gateway)
// ---------------------------------------------------------------------------

test.describe('Slice 13 — the same upload/download example against S3', () => {
  let scratch: ScratchApp | undefined;
  let scratchPool: Pool | undefined;
  let scratchApi: APIRequestContext | undefined;
  let workspace: TestWorkspace | undefined;

  test.beforeAll(async () => {
    await recreateScratchDatabase();
    scratch = await startScratchS3App();
    scratchPool = new Pool({
      connectionString: databaseUrl(SCRATCH_DATABASE),
      max: 4,
    });
    // The scratch instance runs the full migration set at startup, so seeding
    // must happen after it is ready.
    const seeded = await seedWorkspaces(scratchPool);
    workspace = seeded.workspaceA;
    scratchApi = await multipartContext(SCRATCH_URL);
  });

  test.afterAll(async () => {
    if (scratchApi) await scratchApi.dispose();
    await stopScratchApp(scratch);
    if (scratchPool) await scratchPool.end();
    await dropScratchDatabase();
  });

  test('upload and download round trip with ATTACHMENT_STORAGE_ADAPTER=s3', async () => {
    const ticketRes = await scratchApi!.post('/api/tickets', {
      data: {
        title: 'S3 attachment journey',
        ticketTypeId: workspace!.ticketTypeId,
        priorityId: workspace!.priorityId,
      },
      headers: { Cookie: `sessionId=${workspace!.requesterSession}` },
    });
    expect(ticketRes.status()).toBe(200);
    const ticketId = ((await ticketRes.json()) as { id: string }).id;

    const attachment = await assertRoundTrip(scratchApi!, workspace!, ticketId, 's3');

    const rows = await scratchPool!.query(
      'SELECT storage_key FROM attachments WHERE id = $1',
      [attachment.id],
    );
    expect(rows.rows[0]!.storage_key).toBeTruthy();

    // S4: the configured S3 adapter never wrote to the local volume.
    const localEntries = await readdir(scratch!.localDir).catch(() => [] as string[]);
    expect(localEntries).toEqual([]);
  });

  test('a rejected upload stores no metadata in S3 mode either', async () => {
    const ticketRes = await scratchApi!.post('/api/tickets', {
      data: {
        title: 'S3 rejected attachment',
        ticketTypeId: workspace!.ticketTypeId,
        priorityId: workspace!.priorityId,
      },
      headers: { Cookie: `sessionId=${workspace!.requesterSession}` },
    });
    const ticketId = ((await ticketRes.json()) as { id: string }).id;

    const rejected = await uploadAttachment(
      scratchApi!,
      ticketId,
      workspace!.requesterSession,
      { name: 'payload.bat', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
    );
    expect(rejected.status).toBe(400);

    const rows = await scratchPool!.query(
      'SELECT count(*)::int AS n FROM attachments WHERE ticket_id = $1',
      [ticketId],
    );
    expect(rows.rows[0].n).toBe(0);
    const localEntries = await readdir(scratch!.localDir).catch(() => [] as string[]);
    expect(localEntries).toEqual([]);
  });
});
