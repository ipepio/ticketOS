import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppModules, RouteIdentity } from './dependencies.js';
import type { Config } from '../config.js';
import type { Role, WorkspaceId } from '@ticketos/shared';

type AdminContext = { userId: string; workspaceId: WorkspaceId };

async function requireWorkspaceAdmin(
  request: FastifyRequest,
  identity: RouteIdentity,
): Promise<AdminContext | null> {
  const sessionId = request.cookies.sessionId;
  if (!sessionId) return null;

  const session = await identity.getSession(sessionId);
  if (!session?.workspaceId) return null;

  const allowed = await identity.hasCapability(
    session.userId,
    session.workspaceId,
    'memberships:manage',
  );
  return allowed ? { userId: session.userId, workspaceId: session.workspaceId } : null;
}

/** Workspace administration HTTP adapter. */
export async function registerAdminRoutes(
  fastify: FastifyInstance,
  _config: Config,
  modules: AppModules,
): Promise<void> {
  const { identity, workspace } = modules;

  fastify.get('/api/admin/organizations', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request, identity);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });

    return reply.send(await workspace.listOrganizationSummaries(context.workspaceId));
  });

  fastify.post('/api/admin/organizations', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request, identity);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });
    const { name } = request.body as { name?: string };
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

    const organization = await workspace.createOrganizationSummary(
      context.workspaceId,
      name.trim(),
    );
    return reply.status(201).send(organization);
  });

  fastify.get('/api/admin/members', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request, identity);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });

    return reply.send(await workspace.listWorkspaceMemberSummaries(context.workspaceId));
  });

  fastify.post('/api/admin/members', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request, identity);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });
    const body = request.body as {
      email?: string;
      name?: string;
      role?: Role;
      organizationId?: string | null;
    };
    const email = body.email?.trim().toLowerCase();
    const role = body.role ?? 'requester';
    const roles: Role[] = ['installation-admin', 'workspace-admin', 'agent', 'requester'];
    if (!email || !email.includes('@')) return reply.status(400).send({ error: 'valid email is required' });
    if (!roles.includes(role)) return reply.status(400).send({ error: 'invalid role' });

    try {
      const member = await workspace.addWorkspaceMember(context.workspaceId, {
        email,
        name: body.name?.trim() || null,
        role,
        organizationId: body.organizationId ?? null,
      });
      return reply.status(201).send(member);
    } catch (error) {
      fastify.log.error({ error }, 'Failed to add Workspace Member');
      return reply.status(400).send({ error: 'Unable to add Workspace Member' });
    }
  });

  fastify.patch('/api/admin/members/:id', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request, identity);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });
    const { id } = request.params as { id: string };
    const body = request.body as { role?: Role; organizationId?: string | null; status?: 'active' | 'inactive' };

    const membership = await workspace.updateWorkspaceMember(context.workspaceId, id, {
      role: body.role,
      hasOrganizationId: Object.hasOwn(body, 'organizationId'),
      organizationId: body.organizationId,
      status: body.status,
    });
    if (!membership) return reply.status(404).send({ error: 'Workspace Membership not found' });
    return reply.send({ id: membership.id });
  });
}