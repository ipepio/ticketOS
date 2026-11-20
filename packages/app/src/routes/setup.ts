import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { AppModules } from './dependencies.js';
import { cookieOptions } from './auth.js';

/**
 * Setup routes — first-run onboarding wizard
 *
 * The SQL of the installation bootstrap lives in the workspace module
 * (`PostgresWorkspace.bootstrapInstallation`), so this adapter only validates the
 * request and translates the result into HTTP. The audit event the bootstrap
 * appends stays inside that one transaction boundary, exactly where the wizard
 * used to append it.
 */
export async function registerSetupRoutes(
  fastify: FastifyInstance,
  config: Config,
  modules: AppModules,
): Promise<void> {
  const { workspace, audit } = modules;

  // GET /api/setup/status — is this installation configured?
  fastify.get('/api/setup/status', async (_request, reply) => {
    const configured = (await workspace.countWorkspaces()) > 0;
    return reply.send({ configured });
  });

  // POST /api/setup/bootstrap — create initial Workspace + admin
  fastify.post('/api/setup/bootstrap', async (request, reply) => {
    // Guard: only one bootstrap allowed
    if ((await workspace.countWorkspaces()) > 0) {
      return reply.status(409).send({ error: 'Installation already configured' });
    }

    const body = request.body as {
      installationName?: string;
      workspaceName?: string;
      adminEmail?: string;
      adminName?: string;
      locale?: string;
      timezone?: string;
    };

    if (!body.workspaceName || !body.adminEmail) {
      return reply.status(400).send({ error: 'workspaceName and adminEmail are required' });
    }

    try {
      const { workspaceId, sessionId } = await workspace.bootstrapInstallation(
        {
          workspaceName: body.workspaceName,
          adminEmail: body.adminEmail,
          timezone: body.timezone,
        },
        audit,
      );

      reply.setCookie('sessionId', sessionId, cookieOptions(config));
      return reply.send({
        workspaceId,
        message: 'Installation configured.',
      });
    } catch (err) {
      fastify.log.error({ err }, 'Bootstrap failed');
      return reply.status(500).send({ error: 'Bootstrap failed' });
    }
  });
}
