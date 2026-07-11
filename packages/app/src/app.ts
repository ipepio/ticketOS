import type { Config } from './config.js';
import { initDb, closeDb, getPool } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerRootRoute } from './routes/root.js';
import { PostgresOutbox } from './db/outbox.js';
import { PostgresAudit } from './db/audit.js';
import type { OutboxModule, AuditModule } from '@ticketos/domain';
import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

let outbox: OutboxModule | null = null;
let audit: AuditModule | null = null;

export function getOutbox(): OutboxModule {
  if (!outbox) {
    throw new Error('Outbox not initialized. Call initApp() first.');
  }
  return outbox;
}

export function getAudit(): AuditModule {
  if (!audit) {
    throw new Error('Audit not initialized. Call initApp() first.');
  }
  return audit;
}

export async function initApp(config: Config): Promise<{
  app: FastifyInstance;
}> {
  // Initialize database
  await initDb(config);
  await migrate(getPool());

  // Initialize domain modules (outbox, audit)
  outbox = new PostgresOutbox(getPool());
  audit = new PostgresAudit(getPool());

  // Create Fastify instance
  const app = fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.LOG_LEVEL !== 'silent' && config.LOG_LEVEL !== 'info'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'SYS:HH:mm:ss.000',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register plugins
  await app.register(fastifyCors, { origin: config.CORS_ORIGIN });
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: config.SESSION_SECRET,
    cookie: {
      secure: config.PORT !== 3000,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
    },
  });

  // Register routes
  await app.register(registerRootRoute);
  await app.register(registerHealthRoutes);

  // Serve built portal (if exists)
  const portalDist = join(__dirname, '../../../../portal/dist');
  try {
    await readFile(join(portalDist, 'index.html'));
    await app.register(fastifyStatic, {
      root: portalDist,
      prefix: '/',
    });
  } catch {
    // Portal not built yet — skip static serving
  }

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error({ err: error }, 'Unhandled error');
    const headers = request.headers as Record<string, string | undefined>;
    const correlationId = headers[config.CORRELATION_ID_HEADER] ?? null;
    void reply.status(500).send({
      error: 'Internal Server Error',
      correlationId,
    });
  });

  return { app };
}

export async function shutdownApp(app: FastifyInstance): Promise<void> {
  await app.close();
  await closeDb();
}
