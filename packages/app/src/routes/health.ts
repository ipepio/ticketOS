import type { FastifyInstance } from 'fastify';
import { checkMigrationStatus } from '../db/migrate.js';
import { getPool } from '../db/connection.js';

export async function registerHealthRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/ready', async () => {
    const pool = getPool();
    let dbOk = false;
    try {
      const { rows } = await pool.query('SELECT 1');
      dbOk = rows.length > 0;
    } catch {
      dbOk = false;
    }

    let migrationsOk = false;
    try {
      const { pending } = await checkMigrationStatus(pool);
      migrationsOk = pending.length === 0;
    } catch {
      migrationsOk = false;
    }

    if (dbOk && migrationsOk) {
      return { status: 'ok', checks: { database: 'ok', migrations: 'ok' } };
    }

    fastify.log.warn({ dbOk, migrationsOk }, 'Readiness check failed');
    return { status: 'error', message: 'Service not ready' };
  });
}
