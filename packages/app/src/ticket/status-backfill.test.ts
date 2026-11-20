import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';

/**
 * Ticket `status_id` backfill (migration 027) — migration-layer contract.
 *
 * This file exercises the migration itself, not the Ticket module (that is
 * covered by the domain/route integration tests). It observes only what the
 * migration owns: the additive `tickets.status_id` column, its foreign key and
 * index, and the backfill that maps every legacy TEXT `tickets.status` value to
 * a Status row of the same Workspace.
 *
 * The suite runs against a scratch database it creates and drops itself, so the
 * real `migrate()` runs over the full production migration chain and the shared
 * test database is never mutated.
 */
describe('Ticket status_id backfill (migration 027)', () => {
  // Fixed identifier: CREATE/DROP DATABASE cannot take bind parameters, and a
  // fixed name mirrors how the e2e suite owns ticketos_e2e. Idempotent drop on
  // both sides keeps a crashed run from poisoning the next one. The database
  // DDL below uses the same name as a literal for the same reason.
  const SCRATCH_DATABASE = 'ticketos_status_test';
  const MIGRATION_FILE = '027_ticket_status_id.sql';
  const baseUrl =
    process.env.DATABASE_URL ??
    'postgresql://ticketos:ticketos@localhost:5432/ticketos';

  let adminPool: Pool | null = null;
  let pool: Pool | null = null;

  let userId = '';
  let configuredWorkspaceId = '';
  let bareWorkspaceId = '';
  let partialWorkspaceId = '';

  const statusIds = new Map<string, string>();
  const tickets = new Map<string, string>();

  const withUrl = (database: string): string => {
    const url = new URL(baseUrl);
    url.pathname = `/${database}`;
    return url.toString();
  };

  /**
   * Replays migration 027 through the real `migrate()` runner. Production
   * applies 027 once to a database that already holds legacy Tickets; here the
   * schema is migrated first, the legacy rows are seeded with a NULL
   * `status_id`, and 027 is re-applied — the exact state (column present, no
   * value resolved) that a pre-027 installation reaches.
   */
  const replayStatusMigration = async (): Promise<void> => {
    await pool!.query('DELETE FROM schema_migrations WHERE name = $1', [
      MIGRATION_FILE,
    ]);
    await migrate(pool!);
  };

  const insertStatus = async (
    workspaceId: string,
    name: string,
    category: string,
    sortOrder: number,
    isDefault: boolean,
  ): Promise<string> => {
    const { rows } = await pool!.query(
      `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [workspaceId, name, category, sortOrder, isDefault],
    );
    statusIds.set(name, rows[0].id as string);
    return rows[0].id as string;
  };

  const insertLegacyTicket = async (
    workspaceId: string,
    title: string,
    status: string,
    presetStatusId: string | null = null,
  ): Promise<void> => {
    const { rows } = await pool!.query(
      `INSERT INTO tickets (workspace_id, title, status, created_by, status_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [workspaceId, title, status, userId, presetStatusId],
    );
    tickets.set(title, rows[0].id as string);
  };

  const statusIdOf = async (title: string): Promise<string | null> => {
    const { rows } = await pool!.query(
      'SELECT status_id FROM tickets WHERE id = $1',
      [tickets.get(title)],
    );
    return (rows[0]?.status_id ?? null) as string | null;
  };

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: withUrl('postgres'), max: 1 });
    await adminPool.query(
      'DROP DATABASE IF EXISTS ticketos_status_test WITH (FORCE)',
    );
    await adminPool.query('CREATE DATABASE ticketos_status_test');

    pool = new Pool({ connectionString: withUrl(SCRATCH_DATABASE), max: 1 });

    // The real migration chain, so statuses/status_categories and every Ticket
    // constraint are the production ones.
    await migrate(pool);

    const { rows: users } = await pool.query(
      "INSERT INTO users (email) VALUES ('backfill@example.com') RETURNING id",
    );
    userId = users[0].id as string;

    // --- Workspace A: a Status for every mapped category -------------------
    const { rows: configured } = await pool.query(
      "INSERT INTO workspaces (name) VALUES ('Configured Workspace') RETURNING id",
    );
    configuredWorkspaceId = configured[0].id as string;

    // 'new': two Statuses, the default is NOT the first by sort_order, so a
    // backfill that ignored is_default would pick the wrong row.
    await insertStatus(configuredWorkspaceId, 'New Ticket', 'new', 1, false);
    await insertStatus(configuredWorkspaceId, 'Triage', 'new', 2, true);
    // 'open': no default, so the first by sort_order wins.
    await insertStatus(configuredWorkspaceId, 'Open', 'open', 3, false);
    await insertStatus(configuredWorkspaceId, 'In Progress', 'open', 4, false);
    await insertStatus(configuredWorkspaceId, 'Pending', 'pending', 5, false);
    await insertStatus(configuredWorkspaceId, 'Resolved', 'resolved', 6, false);
    await insertStatus(configuredWorkspaceId, 'Closed', 'closed', 7, false);

    // --- Workspace B: no Statuses at all ----------------------------------
    const { rows: bare } = await pool.query(
      "INSERT INTO workspaces (name) VALUES ('Bare Workspace') RETURNING id",
    );
    bareWorkspaceId = bare[0].id as string;

    // --- Workspace C: Statuses only for the 'new' category ----------------
    const { rows: partial } = await pool.query(
      "INSERT INTO workspaces (name) VALUES ('Partial Workspace') RETURNING id",
    );
    partialWorkspaceId = partial[0].id as string;
    await insertStatus(partialWorkspaceId, 'Inbox', 'new', 1, true);

    // --- Legacy Tickets, one per legacy status value ----------------------
    await insertLegacyTicket(configuredWorkspaceId, 'backlog ticket', 'backlog');
    await insertLegacyTicket(configuredWorkspaceId, 'todo ticket', 'todo');
    await insertLegacyTicket(
      configuredWorkspaceId,
      'in_progress ticket',
      'in_progress',
    );
    await insertLegacyTicket(configuredWorkspaceId, 'done ticket', 'done');
    await insertLegacyTicket(
      configuredWorkspaceId,
      'cancelled ticket',
      'cancelled',
    );
    // Already-resolved Ticket: the backfill must not overwrite it.
    await insertLegacyTicket(
      configuredWorkspaceId,
      'pre-set ticket',
      'backlog',
      statusIds.get('Open')!,
    );

    await insertLegacyTicket(bareWorkspaceId, 'bare backlog ticket', 'backlog');
    await insertLegacyTicket(bareWorkspaceId, 'bare done ticket', 'done');

    await insertLegacyTicket(partialWorkspaceId, 'partial backlog ticket', 'backlog');
    await insertLegacyTicket(partialWorkspaceId, 'partial todo ticket', 'todo');

    await replayStatusMigration();
  }, 60000);

  afterAll(async () => {
    try {
      if (pool) {
        await pool.end();
        pool = null;
      }
    } finally {
      if (adminPool) {
        try {
          await adminPool.query(
            'DROP DATABASE IF EXISTS ticketos_status_test WITH (FORCE)',
          );
        } catch {
          // The scratch database is dropped again on the next run's setup.
        }
        await adminPool.end();
        adminPool = null;
      }
    }
  });

  it('adds a nullable status_id column referencing statuses(id) and indexes it', async () => {
    const { rows: columns } = await pool!.query(
      `SELECT attnotnull
         FROM pg_attribute
        WHERE attrelid = 'tickets'::regclass
          AND attname = 'status_id'
          AND NOT attisdropped`,
    );
    expect(columns).toHaveLength(1);
    // Additive: nullable, so legacy rows and un-migrated writes stay valid.
    expect(columns[0].attnotnull).toBe(false);

    const { rows: foreignKeys } = await pool!.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'tickets'::regclass
          AND contype = 'f'
          AND confrelid = 'statuses'::regclass`,
    );
    expect(foreignKeys).toHaveLength(1);

    const { rows: indexes } = await pool!.query(
      `SELECT indexdef
         FROM pg_indexes
        WHERE tablename = 'tickets'
          AND indexname = 'idx_tickets_workspace_status_id'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toMatch(/\(workspace_id, status_id\)/);
  });

  it('maps every legacy status to the same Workspace status of the mapped category', async () => {
    expect(await statusIdOf('backlog ticket')).toBe(statusIds.get('Triage'));
    expect(await statusIdOf('todo ticket')).toBe(statusIds.get('Open'));
    expect(await statusIdOf('in_progress ticket')).toBe(statusIds.get('Open'));
    expect(await statusIdOf('done ticket')).toBe(statusIds.get('Resolved'));
    expect(await statusIdOf('cancelled ticket')).toBe(statusIds.get('Closed'));
  });

  it('does not overwrite a status_id that is already resolved', async () => {
    expect(await statusIdOf('pre-set ticket')).toBe(statusIds.get('Open'));
  });

  it('leaves status_id NULL for Workspaces with no matching Status', async () => {
    expect(await statusIdOf('bare backlog ticket')).toBeNull();
    expect(await statusIdOf('bare done ticket')).toBeNull();
  });

  it('leaves status_id NULL when the Workspace has no Status for the mapped category', async () => {
    expect(await statusIdOf('partial backlog ticket')).toBe(
      statusIds.get('Inbox'),
    );
    expect(await statusIdOf('partial todo ticket')).toBeNull();
  });

  it('keeps the legacy status CHECK constraint enforced', async () => {
    await expect(
      pool!.query(
        `INSERT INTO tickets (workspace_id, title, status, created_by)
         VALUES ($1, 'invalid status ticket', 'archived', $2)`,
        [configuredWorkspaceId, userId],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('re-runs cleanly and leaves the resolved status_ids unchanged', async () => {
    const before = new Map<string, string | null>();
    for (const title of tickets.keys()) {
      before.set(title, await statusIdOf(title));
    }

    await replayStatusMigration();

    for (const [title, previous] of before) {
      expect(await statusIdOf(title)).toBe(previous);
    }

    // The IF NOT EXISTS guard keeps a single index after the replay.
    const { rows: indexes } = await pool!.query(
      `SELECT indexname
         FROM pg_indexes
        WHERE tablename = 'tickets'
          AND indexname = 'idx_tickets_workspace_status_id'`,
    );
    expect(indexes).toHaveLength(1);
  });
});
