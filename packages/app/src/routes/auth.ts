import type { FastifyInstance } from 'fastify';
import { getIdentity, getWorkspace } from '../app.js';
import type { Config } from '../config.js';

/**
 * Auth routes — magic link issue/verify
 */
export async function registerAuthRoutes(
  fastify: FastifyInstance,
  config: Config,
): Promise<void> {
  // POST /api/auth/magic-link — issue a magic link
  fastify.post('/api/auth/magic-link', async (request, reply) => {
    const body = request.body as { email: string; workspaceId?: string };
    if (!body.email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    const identity = getIdentity();
    let workspaceId: string | undefined;

    // If workspaceId provided, validate it exists
    if (body.workspaceId) {
      const ws = await getWorkspace().getWorkspace(body.workspaceId);
      if (!ws) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      workspaceId = ws.id;
    } else {
      // Get user's first workspace for default context
      const users = await identity.getUserMemberships(body.email as any);
      if (users.length > 0) {
        workspaceId = users[0]!.workspaceId;
      }
    }

    try {
      const wsId = workspaceId || crypto.randomUUID();
      const result = await identity.requestMagicLink(body.email, wsId as any);
      // In production, send email here. For now, return token for testing.
      return reply.send({ token: result.token, message: 'Magic link sent' });
    } catch (err) {
      fastify.log.error({ err }, 'Magic link request failed');
      return reply.status(500).send({ error: 'Failed to issue magic link' });
    }
  });

  // POST /api/auth/verify — verify magic link or OIDC
  fastify.post('/api/auth/verify', async (request, reply) => {
    const body = request.body as { token?: string; provider?: string; subject?: string };

    const identity = getIdentity();

    if (body.token) {
      const auth = await identity.verifyMagicLink(body.token);
      if (!auth) {
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }

      // Create session
      const sessionId = await identity.createSession(auth.userId, auth.workspaceId || null);
      reply.setCookie('sessionId', sessionId, {
        httpOnly: true,
        secure: config.PORT !== 3000,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
      });

      return reply.send({ userId: auth.userId, workspaceId: auth.workspaceId });
    }

    if (body.provider && body.subject) {
      // OIDC authenticate (simplified — in production would validate with IdP)
      const auth = await identity.authenticateOidc(body.provider, body.subject);
      if (!auth) {
        return reply.status(401).send({ error: 'OIDC authentication failed' });
      }

      const sessionId = await identity.createSession(auth.userId, auth.workspaceId || null);
      reply.setCookie('sessionId', sessionId, {
        httpOnly: true,
        secure: config.PORT !== 3000,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
      });

      return reply.send({ userId: auth.userId, workspaceId: auth.workspaceId });
    }

    return reply.status(400).send({ error: 'token or provider+subject required' });
  });

  // GET /api/auth/session — get current session info
  fastify.get('/api/auth/session', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.send({ authenticated: false });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.send({ authenticated: false });
    }

    // Get user memberships
    const memberships = await identity.getUserMemberships(session.userId);

    return reply.send({
      authenticated: true,
      userId: session.userId,
      workspaceId: session.workspaceId,
      memberships,
    });
  });

  // POST /api/auth/logout — destroy session
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (sessionId) {
      const identity = getIdentity();
      await identity.deleteSession(sessionId);
    }
    reply.clearCookie('sessionId');
    return reply.send({ message: 'Logged out' });
  });
}
