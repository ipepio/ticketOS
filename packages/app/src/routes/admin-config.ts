import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getIdentity, getWorkflowConfiguration } from '../app.js';
import type { Config } from '../config.js';
import {
  ConfigurationValidationError,
  ConfigurationConflictError,
  ConfigurationNotFoundError,
  CrossWorkspaceReferenceError,
  type WorkflowConfigurationModule,
} from '@ticketos/domain';
import { z } from 'zod';

// ── Zod schemas ────────────────────────────────────────────────────────────

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const positiveIntSchema = z.number().int().min(1);

const createStatusSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(['new', 'open', 'pending', 'resolved', 'closed']),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
});
const updateStatusSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.enum(['new', 'open', 'pending', 'resolved', 'closed']).optional(),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
  sortOrder: positiveIntSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const createTicketTypeSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(['incident', 'service-request']),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
  sortOrder: positiveIntSchema.optional(),
});
const updateTicketTypeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.enum(['incident', 'service-request']).optional(),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
  sortOrder: positiveIntSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const createPrioritySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
  sortOrder: positiveIntSchema.optional(),
});
const updatePrioritySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  color: hexColorSchema.optional(),
  sortOrder: positiveIntSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const orderedIdsSchema = z.array(z.string().uuid()).min(1);
const transitionSchema = z.object({ fromStatusId: z.string().uuid(), toStatusId: z.string().uuid() });

// ── Helpers ────────────────────────────────────────────────────────────────

/** Error translation (S10) — stable machine-readable codes, never raw SQL. */
function mapError(error: unknown) {
  if (error instanceof ConfigurationValidationError)
    return { status: 400, body: { code: error.code, message: error.message } };
  if (error instanceof ConfigurationConflictError)
    return { status: 409, body: { code: error.code, message: error.message } };
  if (error instanceof ConfigurationNotFoundError)
    return { status: 404, body: { code: error.code, message: error.message } };
  if (error instanceof CrossWorkspaceReferenceError)
    return { status: 404, body: { code: error.code, message: error.message } };
  return { status: 500, body: { code: 'internal-error', message: 'An unexpected error occurred' } };
}

/**
 * Capability authorization (S1).
 * Every route requires `config:manage` resolved through `identity.hasCapability`.
 * A missing capability returns 403 without revealing data.
 */
async function requireConfigCapability(
  request: FastifyRequest,
): Promise<{ userId: string; workspaceId: string } | null> {
  const sessionId = request.cookies.sessionId;
  if (!sessionId) return null;
  const identity = getIdentity();
  const session = await identity.getSession(sessionId);
  if (!session?.workspaceId) return null;
  const allowed = await identity.hasCapability(
    session.userId, session.workspaceId, 'config:manage',
  );
  return allowed ? { userId: session.userId, workspaceId: session.workspaceId } : null;
}

/** Generic route: auth → validate → invoke → map error → respond. */
function authed(
  handler: (
    ctx: { userId: string; workspaceId: string },
    body: unknown,
    params: Record<string, string>,
    reply: FastifyReply,
  ) => Promise<void>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = await requireConfigCapability(request);
    if (!ctx) return reply.status(403).send({ code: 'forbidden', message: 'Config management access required' });
    try {
      await handler(ctx, request.body, request.params as Record<string, string>, reply);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          code: 'validation-error', message: err.errors[0]?.message ?? 'Invalid input',
        });
      }
      const mapped = mapError(err);
      return reply.status(mapped.status).send(mapped.body);
    }
  };
}

// ── Route registration ────────────────────────────────────────────────────

/** Resolve the composed configuration module per request: module-scope
 * initialization would run before initApp() and break the import graph. */
function workflow(): WorkflowConfigurationModule {
  return getWorkflowConfiguration();
}

/** Workspace configuration routes: Statuses, Priorities, Ticket Types, Transitions. */
export async function registerAdminConfigRoutes(
  fastify: FastifyInstance,
  _config: Config,
): Promise<void> {
  // ── Statuses ────────────────────────────────────────────────────────────

  fastify.get('/api/admin/statuses', authed(async (ctx, _body, _params, reply) => {
    const statuses = await workflow().listStatuses(ctx.workspaceId);
    return reply.send(statuses);
  }));

  fastify.post('/api/admin/statuses', authed(async (ctx, body, _params, reply) => {
    const input = createStatusSchema.parse(body);
    const s = await workflow().createStatus(ctx.workspaceId, ctx.userId, input);
    return reply.status(201).send({ id: s.id });
  }));

  fastify.patch('/api/admin/statuses/:id', authed(async (ctx, body, params, reply) => {
    const input = updateStatusSchema.parse(body);
    const s = await workflow().updateStatus(ctx.workspaceId, ctx.userId, params.id as string, input);
    return reply.send({ id: s.id });
  }));

  fastify.put('/api/admin/statuses/order', authed(async (ctx, body, _params, reply) => {
    const ids = orderedIdsSchema.parse(body);
    await workflow().reorderStatuses(ctx.workspaceId, ctx.userId, ids);
    return reply.send({ ok: true });
  }));

  fastify.post('/api/admin/statuses/:id/active', authed(async (ctx, body, params, reply) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(body);
    const s = await workflow().setStatusActive(ctx.workspaceId, ctx.userId, params.id as string, isActive);
    return reply.send({ id: s.id, isActive: s.isActive });
  }));

  // ── Priorities ──────────────────────────────────────────────────────────

  fastify.get('/api/admin/priorities', authed(async (ctx, _body, _params, reply) => {
    return reply.send(await workflow().listPriorities(ctx.workspaceId));
  }));

  fastify.post('/api/admin/priorities', authed(async (ctx, body, _params, reply) => {
    const input = createPrioritySchema.parse(body);
    const p = await workflow().createPriority(ctx.workspaceId, ctx.userId, input);
    return reply.status(201).send({ id: p.id });
  }));

  fastify.patch('/api/admin/priorities/:id', authed(async (ctx, body, params, reply) => {
    const input = updatePrioritySchema.parse(body);
    const p = await workflow().updatePriority(ctx.workspaceId, ctx.userId, params.id as string, input);
    return reply.send({ id: p.id });
  }));

  fastify.put('/api/admin/priorities/order', authed(async (ctx, body, _params, reply) => {
    const ids = orderedIdsSchema.parse(body);
    await workflow().reorderPriorities(ctx.workspaceId, ctx.userId, ids);
    return reply.send({ ok: true });
  }));

  fastify.post('/api/admin/priorities/:id/active', authed(async (ctx, body, params, reply) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(body);
    const p = await workflow().setPriorityActive(ctx.workspaceId, ctx.userId, params.id as string, isActive);
    return reply.send({ id: p.id, isActive: p.isActive });
  }));

  fastify.post('/api/admin/priorities/:id/default', authed(async (ctx, _body, params, reply) => {
    const p = await workflow().setDefaultPriority(ctx.workspaceId, ctx.userId, params.id as string);
    return reply.send({ id: p.id });
  }));

  // ── Ticket Types ────────────────────────────────────────────────────────

  fastify.get('/api/admin/ticket-types', authed(async (ctx, _body, _params, reply) => {
    return reply.send(await workflow().listTicketTypes(ctx.workspaceId));
  }));

  fastify.post('/api/admin/ticket-types', authed(async (ctx, body, _params, reply) => {
    const input = createTicketTypeSchema.parse(body);
    const t = await workflow().createTicketType(ctx.workspaceId, ctx.userId, input);
    return reply.status(201).send({ id: t.id });
  }));

  fastify.patch('/api/admin/ticket-types/:id', authed(async (ctx, body, params, reply) => {
    const input = updateTicketTypeSchema.parse(body);
    const t = await workflow().updateTicketType(ctx.workspaceId, ctx.userId, params.id as string, input);
    return reply.send({ id: t.id });
  }));

  fastify.put('/api/admin/ticket-types/order', authed(async (ctx, body, _params, reply) => {
    const ids = orderedIdsSchema.parse(body);
    await workflow().reorderTicketTypes(ctx.workspaceId, ctx.userId, ids);
    return reply.send({ ok: true });
  }));

  fastify.post('/api/admin/ticket-types/:id/active', authed(async (ctx, body, params, reply) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(body);
    const t = await workflow().setTicketTypeActive(ctx.workspaceId, ctx.userId, params.id as string, isActive);
    return reply.send({ id: t.id, isActive: t.isActive });
  }));

  fastify.post('/api/admin/ticket-types/:id/default', authed(async (ctx, _body, params, reply) => {
    const t = await workflow().setDefaultTicketType(ctx.workspaceId, ctx.userId, params.id as string);
    return reply.send({ id: t?.id ?? null });
  }));

  // ── Transitions ─────────────────────────────────────────────────────────

  fastify.get('/api/admin/transitions', authed(async (ctx, _body, _params, reply) => {
    return reply.send(await workflow().listTransitions(ctx.workspaceId));
  }));

  fastify.post('/api/admin/transitions', authed(async (ctx, body, _params, reply) => {
    const { fromStatusId, toStatusId } = transitionSchema.parse(body);
    const t = await workflow().addTransition(ctx.workspaceId, ctx.userId, fromStatusId, toStatusId);
    return reply.status(201).send({ id: t.id });
  }));

  fastify.delete('/api/admin/transitions', authed(async (ctx, body, _params, reply) => {
    const { fromStatusId, toStatusId } = transitionSchema.parse(body);
    await workflow().removeTransition(ctx.workspaceId, ctx.userId, fromStatusId, toStatusId);
    return reply.send({ ok: true });
  }));
}