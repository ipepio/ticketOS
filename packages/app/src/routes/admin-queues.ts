import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getIdentity, getWorkspace } from '../app.js';
import type { WorkspaceId, UserId } from '@ticketos/shared';
import {
  ConfigurationConflictError,
  ConfigurationNotFoundError,
  ConfigurationValidationError,
} from '@ticketos/domain';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const accessModeSchema = z.enum(['workspace-agents', 'restricted']);

const createQueueSchema = z.object({
  name: z.string().min(1),
  accessMode: accessModeSchema.optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(1).optional(),
  accessMode: accessModeSchema.optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Session helper
// ---------------------------------------------------------------------------

async function getSessionContext(request: FastifyRequest): Promise<{
  userId: UserId;
  workspaceId: WorkspaceId;
} | null> {
  const sessionId = request.cookies.sessionId;
  if (!sessionId) return null;

  const identity = getIdentity();
  const session = await identity.getSession(sessionId);
  if (!session?.workspaceId) return null;

  return { userId: session.userId, workspaceId: session.workspaceId };
}

// ---------------------------------------------------------------------------
// Capability authorisation
// ---------------------------------------------------------------------------

async function checkCapability(
  reply: FastifyReply,
  userId: UserId,
  workspaceId: WorkspaceId,
  capability: string,
): Promise<boolean> {
  const identity = getIdentity();
  const has = await identity.hasCapability(
    userId,
    workspaceId,
    capability as any,
  );
  if (!has) {
    await reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

function translateError(error: unknown): { status: number; body: { code: string; message: string } } {
  if (error instanceof ConfigurationValidationError) {
    return { status: 400, body: { code: error.code, message: error.message } };
  }
  if (error instanceof ConfigurationConflictError) {
    return { status: 409, body: { code: error.code, message: error.message } };
  }
  if (error instanceof ConfigurationNotFoundError) {
    return { status: 404, body: { code: error.code, message: error.message } };
  }
  return { status: 500, body: { code: 'internal-error', message: 'Internal server error' } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function registerAdminQueueRoutes(
  fastify: FastifyInstance,
  _config: unknown,
): Promise<void> {
  // GET /api/admin/queues — list queues (queues:manage)
  fastify.get('/api/admin/queues', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const ok = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!ok) return;

    try {
      const workspaceModule = getWorkspace();
      const queues = await workspaceModule.listQueues(context.workspaceId);
      return reply.send(queues);
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /api/admin/queues — create queue (queues:manage)
  fastify.post('/api/admin/queues', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const ok = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!ok) return;

    const parsed = createQueueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'validation-error',
        message: 'Invalid queue input',
      });
    }

    try {
      const workspaceModule = getWorkspace();
      const queue = await workspaceModule.createQueue(context.workspaceId, context.userId, {
        name: parsed.data.name,
        accessMode: parsed.data.accessMode,
      });
      return reply.status(201).send({
        id: queue.id,
        name: queue.name,
        accessMode: queue.accessMode,
        memberCount: 0,
        createdAt: queue.createdAt,
      });
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });

  // PATCH /api/admin/queues/:id — update queue
  fastify.patch('/api/admin/queues/:id', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const { id: queueId } = request.params as { id: string };
    const parsed = updateQueueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'validation-error',
        message: 'Invalid queue input',
      });
    }

    // queues:manage is required for ANY queue update, including an empty body:
    // a body-conditional check let an unprivileged caller read queue metadata.
    const hasAccessModeChange = parsed.data.accessMode !== undefined;

    const canManage = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!canManage) return;
    if (hasAccessModeChange) {
      const canRestrict = await checkCapability(reply, context.userId, context.workspaceId, 'queues:restrict');
      if (!canRestrict) return;
    }

    try {
      const workspaceModule = getWorkspace();
      const queue = await workspaceModule.updateQueue(
        context.workspaceId,
        context.userId,
        queueId,
        {
          name: parsed.data.name,
          accessMode: parsed.data.accessMode,
        },
      );
      return reply.send({
        id: queue.id,
        name: queue.name,
        accessMode: queue.accessMode,
        createdAt: queue.createdAt,
      });
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });

  // GET /api/admin/queues/:id/members — list members (queues:manage)
  fastify.get('/api/admin/queues/:id/members', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const ok = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!ok) return;

    const { id: queueId } = request.params as { id: string };

    try {
      const workspaceModule = getWorkspace();
      const members = await workspaceModule.getQueueMembers(context.workspaceId, queueId);
      return reply.send(
        members.map((m) => ({
          userId: m.userId,
          email: m.email,
          name: m.displayName ?? null,
        })),
      );
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /api/admin/queues/:id/members — add member (queues:manage, idempotent)
  fastify.post('/api/admin/queues/:id/members', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const ok = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!ok) return;

    const { id: queueId } = request.params as { id: string };
    const parsed = addMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'validation-error',
        message: 'userId is required',
      });
    }

    try {
      const workspaceModule = getWorkspace();
      await workspaceModule.addQueueMember(
        context.workspaceId,
        context.userId,
        queueId,
        parsed.data.userId,
      );
      // Idempotent: return current member list regardless of whether the insert was a no-op
      const members = await workspaceModule.getQueueMembers(context.workspaceId, queueId);
      return reply.send(
        members.map((m) => ({
          userId: m.userId,
          email: m.email,
          name: m.displayName ?? null,
        })),
      );
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });

  // DELETE /api/admin/queues/:id/members/:userId — remove member (queues:manage, idempotent)
  fastify.delete('/api/admin/queues/:id/members/:userId', async (request, reply) => {
    const context = await getSessionContext(request);
    if (!context) {
      return reply.status(403).send({ code: 'forbidden', message: 'Access denied' });
    }

    const ok = await checkCapability(reply, context.userId, context.workspaceId, 'queues:manage');
    if (!ok) return;

    const { id: queueId, userId } = request.params as { id: string; userId: string };

    try {
      const workspaceModule = getWorkspace();
      await workspaceModule.removeQueueMember(
        context.workspaceId,
        context.userId,
        queueId,
        userId,
      );
      // Idempotent: return current member list regardless of whether the delete was a no-op
      const members = await workspaceModule.getQueueMembers(context.workspaceId, queueId);
      return reply.send(
        members.map((m) => ({
          userId: m.userId,
          email: m.email,
          name: m.displayName ?? null,
        })),
      );
    } catch (error) {
      const { status, body } = translateError(error);
      return reply.status(status).send(body);
    }
  });
}