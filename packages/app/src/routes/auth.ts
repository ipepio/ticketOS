import type { FastifyInstance } from 'fastify';
import { getIdentity, getWorkspace } from '../app.js';
import type { Config } from '../config.js';

/**
 * Determine whether the cookie Secure flag should be set.
 * Production (HTTPS) forces Secure; local dev (HTTP) does not.
 */
function isSecure(config: Config): boolean {
  try {
    const url = new URL(config.PUBLIC_APP_URL);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function cookieOptions(config: Config, maxAge = 86400) {
  return {
    path: '/',
    httpOnly: true,
    secure: isSecure(config),
    sameSite: 'lax' as const,
    maxAge,
  };
}

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
      // An email address is not a User ID. Resolve the global User first, then
      // use one of that User's existing Workspace Memberships.
      const userId = await identity.getUserIdByEmail(body.email);
      if (userId) {
        const memberships = await identity.getUserMemberships(userId);
        workspaceId = memberships[0]?.workspaceId;
      }
    }

    if (!workspaceId) {
      return reply.status(404).send({
        error: 'No Workspace Membership found for this email address',
      });
    }

    try {
      const result = await identity.requestMagicLink(body.email, workspaceId as any);
      // Build the full magic-link URL that the email should contain
      const verifyUrl = `${config.PUBLIC_APP_URL}/?token=${result.token}`;
      fastify.log.info({ email: body.email, verifyUrl }, 'Magic link issued');
      return reply.send({ message: 'Magic link sent' });
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
      reply.setCookie('sessionId', sessionId, cookieOptions(config));

      return reply.send({ userId: auth.userId, workspaceId: auth.workspaceId });
    }

    if (body.provider && body.subject) {
      // OIDC authenticate (simplified — in production would validate with IdP)
      const auth = await identity.authenticateOidc(body.provider, body.subject);
      if (!auth) {
        return reply.status(401).send({ error: 'OIDC authentication failed' });
      }

      const sessionId = await identity.createSession(auth.userId, auth.workspaceId || null);
      reply.setCookie('sessionId', sessionId, cookieOptions(config));

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

    // Enrich memberships for the Workspace selector without exposing other
    // Workspaces to an unauthenticated caller.
    const memberships = await identity.getUserMemberships(session.userId);
    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await getWorkspace().getWorkspace(membership.workspaceId);
        return workspace
          ? { id: workspace.id, name: workspace.name, role: membership.role }
          : null;
      }),
    );

    return reply.send({
      authenticated: true,
      userId: session.userId,
      workspaceId: session.workspaceId,
      workspaces: workspaces.filter((workspace): workspace is NonNullable<typeof workspace> => workspace !== null),
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
