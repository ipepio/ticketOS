import type { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_DIR = join(__dirname, '../../../../migrations');

interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

export async function migrate(pool: Pool): Promise<void> {
  // Create schema_migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Get already-applied migrations
  const { rows: applied } = await pool.query<Migration>(
    'SELECT name FROM schema_migrations ORDER BY id',
  );
  const appliedNames = new Set(applied.map((r) => r.name));

  // Read migration files
  const files = await readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter((f) => f.endsWith('.sql') && !appliedNames.has(f))
    .sort();

  if (migrationFiles.length === 0) {
    return;
  }

  // Apply migrations in a single transaction
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

export async function checkMigrationStatus(pool: Pool): Promise<{
  applied: string[];
  pending: string[];
}> {
  const { rows: applied } = await pool.query<Migration>(
    'SELECT name FROM schema_migrations ORDER BY id',
  );

  const files = await readdir(MIGRATIONS_DIR);
  const allMigrations = files.filter((f) => f.endsWith('.sql')).sort();
  const appliedNames = new Set(applied.map((r) => r.name));
  const pending = allMigrations.filter((f) => !appliedNames.has(f));

  return {
    applied: allMigrations.filter((f) => appliedNames.has(f)),
    pending,
  };
}
