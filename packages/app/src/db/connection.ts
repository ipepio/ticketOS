import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Config } from '../config.js';

let pool: Pool | null = null;
let db: Kysely<any> | null = null;

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDb() first.');
  }
  return pool;
}

export function getDb(): Kysely<any> {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export async function initDb(config: Config): Promise<void> {
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    min: 2,
  });

  // Verify connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }

  const dialect = new PostgresDialect({ pool });

  db = new Kysely({ dialect });
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}
