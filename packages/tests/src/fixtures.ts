import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * Test fixture: provisions two isolated Workspaces with users, memberships,
 * queues, and returns everything the E2E tests need.
 *
 * This helper talks directly to PostgreSQL (the same real DB the app uses)
 * to seed known data, then uses the HTTP API as the test seam.
 */

export interface TestWorkspace {
  id: string;
  name: string;
  adminEmail: string;
  adminUserId: string;
  adminSession: string;
  agentEmail: string;
  agentUserId: string;
  agentSession: string;
  requesterEmail: string;
  requesterUserId: string;
  requesterSession: string;
  openQueueId: string;
  restrictedQueueId: string;
}

export interface TestFixtures {
  workspaceA: TestWorkspace;
  workspaceB: TestWorkspace;
  pool: Pool;
  api: APIRequestContext;
  baseUrl: string;
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:15432/ticketos';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3020';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../migrations');

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// Migration bootstrap
// ---------------------------------------------------------------------------

export async function ensureMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows: applied } = await pool.query(
    'SELECT name FROM schema_migrations ORDER BY id',
  );
  const appliedNames = new Set(applied.map((r: { name: string }) => r.name));

  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter((f) => f.endsWith('.sql') && !appliedNames.has(f))
    .sort();

  if (migrationFiles.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of migrationFiles) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query('SAVEPOINT migration');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name, applied_at) VALUES ($1, NOW())',
          [file],
        );
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT migration');
        throw new Error(`Migration ${file} failed: ${err}`);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function uuid(pool: Pool): Promise<string> {
  const { rows } = await pool.query('SELECT gen_random_uuid() AS id');
  return rows[0].id;
}

async function createUser(pool: Pool, email: string): Promise<string> {
  const { rows } = await pool.query(
    'INSERT INTO users (id, email, verified_at) VALUES ($1, $2, NOW()) RETURNING id',
    [await uuid(pool), email],
  );
  return rows[0].id;
}

async function createWorkspace(pool: Pool, name: string): Promise<string> {
  const { rows } = await pool.query(
    'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
    [await uuid(pool), name],
  );
  return rows[0].id;
}

async function createMembership(
  pool: Pool,
  userId: string,
  workspaceId: string,
  role: 'installation-admin' | 'workspace-admin' | 'agent' | 'requester',
): Promise<void> {
  await pool.query(
    'INSERT INTO workspace_memberships (id, user_id, workspace_id, role) VALUES ($1, $2, $3, $4)',
    [await uuid(pool), userId, workspaceId, role],
  );
}

async function createQueue(
  pool: Pool,
  workspaceId: string,
  name: string,
  accessMode: 'open' | 'restricted',
): Promise<string> {
  const { rows } = await pool.query(
    'INSERT INTO queues (id, workspace_id, name, access_mode) VALUES ($1, $2, $3, $4) RETURNING id',
    [await uuid(pool), workspaceId, name, accessMode],
  );
  return rows[0].id;
}

async function addQueueMember(
  pool: Pool,
  workspaceId: string,
  queueId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    'INSERT INTO queue_members (id, workspace_id, queue_id, user_id) VALUES ($1, $2, $3, $4)',
    [await uuid(pool), workspaceId, queueId, userId],
  );
}

async function createSession(
  pool: Pool,
  userId: string,
  workspaceId: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO sessions (id, user_id, workspace_id, data, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')",
    [sessionId, userId, workspaceId, JSON.stringify({})],
  );
  return sessionId;
}

async function buildWorkspace(
  pool: Pool,
  label: string,
): Promise<TestWorkspace> {
  const adminEmail = `admin-${label}@ticketos.test`;
  const agentEmail = `agent-${label}@ticketos.test`;
  const requesterEmail = `requester-${label}@ticketos.test`;

  const adminUserId = await createUser(pool, adminEmail);
  const agentUserId = await createUser(pool, agentEmail);
  const requesterUserId = await createUser(pool, requesterEmail);

  const workspaceId = await createWorkspace(pool, `Workspace ${label}`);
  await createMembership(pool, adminUserId, workspaceId, 'workspace-admin');
  await createMembership(pool, agentUserId, workspaceId, 'agent');
  await createMembership(pool, requesterUserId, workspaceId, 'requester');

  const openQueueId = await createQueue(
    pool,
    workspaceId,
    `Inbox ${label}`,
    'open',
  );
  const restrictedQueueId = await createQueue(
    pool,
    workspaceId,
    `Security ${label}`,
    'restricted',
  );
  await addQueueMember(pool, workspaceId, restrictedQueueId, agentUserId);

  const adminSession = await createSession(pool, adminUserId, workspaceId);
  const agentSession = await createSession(pool, agentUserId, workspaceId);
  const requesterSession = await createSession(
    pool,
    requesterUserId,
    workspaceId,
  );

  return {
    id: workspaceId,
    name: `Workspace ${label}`,
    adminEmail,
    adminUserId,
    adminSession,
    agentEmail,
    agentUserId,
    agentSession,
    requesterEmail,
    requesterUserId,
    requesterSession,
    openQueueId,
    restrictedQueueId,
  };
}

// ---------------------------------------------------------------------------
// Database cleanup — resilient to missing tables
// ---------------------------------------------------------------------------

const CLEANABLE_TABLES = [
  'intake_quarantine',
  'inbound_emails',
  'outbound_emails',
  'correlation_tokens',
  'email_addresses',
  'attachments',
  'timeline_entries',
  'ticket_followers',
  'ticket_tag_assignments',
  'ticket_tags',
  'tickets',
  'queue_members',
  'queues',
  'workspace_memberships',
  'organizations',
  'sessions',
  'magic_links',
  'oidc_accounts',
  'audit_events',
  'users',
  'workspaces',
  'outbox_events',
];

export async function cleanDatabase(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const existing = new Set(rows.map((r) => r.tablename));

  for (const table of CLEANABLE_TABLES) {
    if (existing.has(table)) {
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture setup / teardown
// ---------------------------------------------------------------------------

export async function setupFixtures(): Promise<TestFixtures> {
  const p = await getPool();
  await cleanDatabase(p);

  const api = await pwRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });

  const workspaceA = await buildWorkspace(p, 'A');
  const workspaceB = await buildWorkspace(p, 'B');

  return {
    workspaceA,
    workspaceB,
    pool: p,
    api,
    baseUrl: BASE_URL,
  };
}

export async function teardownFixtures(fixtures: TestFixtures): Promise<void> {
  try {
    await fixtures.api.dispose();
  } catch {
    // Ignore disposal errors
  }
  await closePool();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function apiPost(
  api: APIRequestContext,
  path: string,
  body: unknown,
  session?: string,
): Promise<{ status: number; data: unknown }> {
  const cookies = session ? [`sessionId=${session}`] : [];
  const res = await api.post(path, {
    data: body,
    headers: { Cookie: cookies.join('; ') },
  });
  return { status: res.status(), data: await res.json().catch(() => null) };
}

export async function apiGet(
  api: APIRequestContext,
  path: string,
  session?: string,
): Promise<{ status: number; data: unknown }> {
  const cookies = session ? [`sessionId=${session}`] : [];
  const res = await api.get(path, {
    headers: { Cookie: cookies.join('; ') },
  });
  return { status: res.status(), data: await res.json().catch(() => null) };
}

export async function apiPut(
  api: APIRequestContext,
  path: string,
  body: unknown,
  session?: string,
): Promise<{ status: number; data: unknown }> {
  const cookies = session ? [`sessionId=${session}`] : [];
  const res = await api.put(path, {
    data: body,
    headers: { Cookie: cookies.join('; ') },
  });
  return { status: res.status(), data: await res.json().catch(() => null) };
}
