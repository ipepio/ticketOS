import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getIdentity } from '../app.js';
import { getPool } from '../db/connection.js';
import type { Config } from '../config.js';
import type { Role, WorkspaceId } from '@ticketos/shared';

type AdminContext = { userId: string; workspaceId: WorkspaceId };

async function requireWorkspaceAdmin(request: FastifyRequest): Promise<AdminContext | null> {
  const sessionId = request.cookies.sessionId;
  if (!sessionId) return null;

  const identity = getIdentity();
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
): Promise<void> {
  fastify.get('/api/admin/organizations', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });

    const { rows } = await getPool().query(
      `SELECT o.id, o.name, o.created_at,
              count(wm.id)::int AS member_count
       FROM organizations o
       LEFT JOIN workspace_memberships wm ON wm.organization_id = o.id
       WHERE o.workspace_id = $1
       GROUP BY o.id
       ORDER BY o.name`,
      [context.workspaceId],
    );
    return reply.send(rows.map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: row.member_count,
      createdAt: row.created_at,
    })));
  });

  fastify.post('/api/admin/organizations', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });
    const { name } = request.body as { name?: string };
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

    const { rows } = await getPool().query(
      `INSERT INTO organizations (workspace_id, name)
       VALUES ($1, $2) RETURNING id, name, created_at`,
      [context.workspaceId, name.trim()],
    );
    return reply.status(201).send({
      id: rows[0]!.id,
      name: rows[0]!.name,
      memberCount: 0,
      createdAt: rows[0]!.created_at,
    });
  });

  fastify.get('/api/admin/members', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });

    const { rows } = await getPool().query(
      `SELECT wm.id, u.id AS user_id, u.email, u.display_name, wm.role,
              wm.status, wm.organization_id, o.name AS organization_name,
              u.last_seen_at, wm.created_at
       FROM workspace_memberships wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN organizations o ON o.id = wm.organization_id
       WHERE wm.workspace_id = $1
       ORDER BY u.email`,
      [context.workspaceId],
    );
    return reply.send(rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      name: row.display_name,
      role: row.role,
      status: row.status,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    })));
  });

  fastify.post('/api/admin/members', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request);
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

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows: users } = await client.query(
        `INSERT INTO users (email, display_name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name)
         RETURNING id`,
        [email, body.name?.trim() || null],
      );
      const { rows } = await client.query(
        `INSERT INTO workspace_memberships (user_id, workspace_id, role, organization_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id, workspace_id) DO UPDATE
         SET role = EXCLUDED.role, organization_id = EXCLUDED.organization_id, status = 'active'
         RETURNING id`,
        [users[0]!.id, context.workspaceId, role, body.organizationId ?? null],
      );
      await client.query('COMMIT');
      return reply.status(201).send({ id: rows[0]!.id });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ error }, 'Failed to add Workspace Member');
      return reply.status(400).send({ error: 'Unable to add Workspace Member' });
    } finally {
      client.release();
    }
  });

  fastify.patch('/api/admin/members/:id', async (request, reply) => {
    const context = await requireWorkspaceAdmin(request);
    if (!context) return reply.status(403).send({ error: 'Workspace Admin access required' });
    const { id } = request.params as { id: string };
    const body = request.body as { role?: Role; organizationId?: string | null; status?: 'active' | 'inactive' };

    const { rows } = await getPool().query(
      `UPDATE workspace_memberships
       SET role = COALESCE($1, role),
           organization_id = CASE WHEN $2::boolean THEN $3::uuid ELSE organization_id END,
           status = COALESCE($4, status)
       WHERE id = $5 AND workspace_id = $6
       RETURNING id`,
      [body.role ?? null, Object.hasOwn(body, 'organizationId'), body.organizationId ?? null, body.status ?? null, id, context.workspaceId],
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Workspace Membership not found' });
    return reply.send({ id: rows[0].id });
  });

  }