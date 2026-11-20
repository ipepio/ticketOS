import type { Config } from './config.js';
import { initDb, closeDb, getPool } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { registerAdminConfigRoutes, registerAdminQueueRoutes, registerAdminRoutes, registerAuthRoutes, registerTicketRoutes, registerSetupRoutes } from './routes/index.js';
import { registerRootRoute } from './routes/root.js';
import { registerHealthRoutes } from './routes/health.js';
import { PostgresOutbox } from './db/outbox.js';
import { PostgresAudit } from './db/audit.js';
import { PostgresIdentity } from './identity/postgres.js';
import { PostgresWorkspace } from './workspace/postgres.js';
import { PostgresWorkflowConfiguration } from './workflow/config-module.js';
import type { WorkflowConfigurationModule } from '@ticketos/domain';
import { PostgresTicket } from './ticket/postgres.js';
import type { OutboxModule, AuditModule } from '@ticketos/domain';
import { initializeAttachmentStorage, type ResolvedStorage } from './storage/selection.js';
import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

let outbox: OutboxModule | null = null;
let audit: AuditModule | null = null;
let identity: PostgresIdentity | null = null;
let workspace: PostgresWorkspace | null = null;
let workflowConfiguration: WorkflowConfigurationModule | null = null;
let ticket: PostgresTicket | null = null;
let storage: ResolvedStorage | null = null;

export function getStorage(): ResolvedStorage {
  if (!storage) {
    throw new Error('Attachment storage not initialized. Call initApp() first.');
  }
  return storage;
}

export function getTicket(): PostgresTicket {
  if (!ticket) {
    throw new Error('Ticket not initialized. Call initApp() first.');
  }
  return ticket;
}

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

export function getIdentity(): PostgresIdentity {
  if (!identity) {
    throw new Error('Identity not initialized. Call initApp() first.');
  }
  return identity;
}

export function getWorkspace(): PostgresWorkspace {
  if (!workspace) {
    throw new Error('Workspace not initialized. Call initApp() first.');
  }
  return workspace;
}

export function getWorkflowConfiguration(): WorkflowConfigurationModule {
  if (!workflowConfiguration) {
    workflowConfiguration = new PostgresWorkflowConfiguration(getPool());
  }
  return workflowConfiguration;
}

export async function initApp(config: Config): Promise<{
  app: FastifyInstance;
}> {
  // Initialize database
  await initDb(config);
  await migrate(getPool());

  // Initialize domain modules
  outbox = new PostgresOutbox(getPool());
  audit = new PostgresAudit(getPool());
  identity = new PostgresIdentity(getPool(), outbox, audit);
  workspace = new PostgresWorkspace(getPool());
  ticket = new PostgresTicket(getPool());

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

  // Resolve Attachment storage before serving traffic (F9/S2). An incomplete S3
  // configuration, or a configured S3 endpoint that is unavailable, aborts
  // startup instead of degrading to the local Attachment volume.
  storage = await initializeAttachmentStorage(config);
  app.log.info(
    {
      storageMode: storage.mode,
      bucket: storage.mode === 's3' ? storage.bucket : undefined,
    },
    'attachment storage ready',
  );

  // Register plugins
  await app.register(fastifyCors, {
    origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(fastifyCookie);

  // Serve the built portal before any route registration: Fastify resolves the
  // first matching route, so a late static registration would lose '/' to the
  // API root handler.
  const portalDist = join(__dirname, '../../portal/dist');
  let portalServed = false;
  try {
    await readFile(join(portalDist, 'index.html'));
    await app.register(fastifyStatic, { root: portalDist, prefix: '/', wildcard: false });
    portalServed = true;
  } catch (err) {
    // The portal bundle is optional in development, but never fail silently:
    // an E2E or production run must know the browser UI is missing.
    app.log.warn({ err, portalDist }, 'portal bundle not found — static serving disabled');
  }

  // Register routes
  await app.register(registerRootRoute);
  await app.register(registerHealthRoutes);
  await app.register(async (fastify) => {
    await registerAuthRoutes(fastify, config);
    await registerTicketRoutes(fastify, config);
    await registerSetupRoutes(fastify, config);
    await registerAdminRoutes(fastify, config);
    await registerAdminConfigRoutes(fastify, config);
    await registerAdminQueueRoutes(fastify, config);
  });

  // Client-side routing fallback: any non-API GET that did not match a file
  // returns the portal shell so a deep link works after a reload.
  if (portalServed) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not Found' });
      }
      return reply.type('text/html').send(await readFile(join(portalDist, 'index.html')));
    });
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
