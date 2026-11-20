import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth } from '../db/health.js';

export async function registerHealthRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/ready', async () => {
    const health = await checkDatabaseHealth();

    if (health.database && health.migrations) {
      return { status: 'ok', checks: { database: 'ok', migrations: 'ok' } };
    }

    fastify.log.warn(
      { dbOk: health.database, migrationsOk: health.migrations },
      'Readiness check failed',
    );
    return { status: 'error', message: 'Service not ready' };
  });
}
