import type { FastifyInstance } from 'fastify';
import { getIdentity, getTicket, getAudit } from '../app.js';
import { z } from 'zod';
import { ConfigurationNotFoundError, ConfigurationValidationError } from '@ticketos/domain';
import { PostgresWorkflowConfiguration } from '../workflow/config-module.js';
import { getPool } from '../db/connection.js';

/**
 * Ticket routes — CRUD, timeline, tags, followers
 */
export async function registerTicketRoutes(
  fastify: FastifyInstance,
  _config: any,
): Promise<void> {
  // GET /api/tickets — list tickets for current workspace
  fastify.get('/api/tickets', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const hasAccess = await identity.hasCapability(
      session.userId,
      workspaceId,
      'tickets:read',
    );
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const { status, priority, assignedTo } = request.query as {
      status?: string;
      priority?: string;
      assignedTo?: string;
    };

    // S1/S2: `?status=` now carries the Workspace-configured Status id.
    if (status !== undefined && status !== '') {
      if (!z.string().uuid().safeParse(status).success) {
        return reply.status(400).send({ error: 'Invalid Status id format' });
      }
    }

    const ticketModule = getTicket();
    const tickets = await ticketModule.listTickets(workspaceId, {
      statusId: status || undefined,
      priority: priority as any,
      assignedTo: assignedTo || null,
    });

    return reply.send(tickets);
  });

  // GET /api/tickets/:id — get ticket detail
  fastify.get('/api/tickets/:id', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = getTicket();
    const ticket = await ticketModule.getTicket(workspaceId, ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasAccess = await identity.hasCapability(
      session.userId,
      ticket.workspaceId,
      'tickets:read',
    );
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    return reply.send(ticket);
  });

  // GET /api/tickets/selectable-configuration — active types & priorities (S9)
  fastify.get('/api/tickets/selectable-configuration', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    // S9: tickets:create capability required
    const hasAccess = await identity.hasCapability(
      session.userId,
      workspaceId,
      'tickets:create',
    );
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const configModule = new PostgresWorkflowConfiguration(getPool());
    const config = await configModule.listSelectableConfiguration(workspaceId);
    return reply.send(config);
  });

  // POST /api/tickets — create ticket (T8: S9, S2, S5)
  fastify.post('/api/tickets', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const hasCreate = await identity.hasCapability(
      session.userId,
      workspaceId,
      'tickets:create',
    );
    if (!hasCreate) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const body = request.body as {
      title: string;
      description?: string;
      priority?: string;
      priorityId?: string;
      ticketTypeId?: string;
      statusId?: string;
      assignedTo?: string;
    };

    if (!body.title) {
      return reply.status(400).send({ error: 'title is required' });
    }

    // Fetch active configuration (S9, S2 — workspace-isolated)
    const configModule = new PostgresWorkflowConfiguration(getPool());
    const config = await configModule.listSelectableConfiguration(workspaceId);

    // Validate & resolve ticketTypeId (S9)
    if (body.ticketTypeId !== undefined) {
      if (!z.string().uuid().safeParse(body.ticketTypeId).success) {
        return reply.status(400).send({ error: 'Invalid ticketTypeId format' });
      }
      if (!config.ticketTypes.some(t => t.id === body.ticketTypeId)) {
        return reply.status(400).send({
          error: 'Ticket Type not found or inactive', code: 'not-found',
        });
      }
    }

    // Validate & resolve priorityId (S9)
    if (body.priorityId !== undefined) {
      if (!z.string().uuid().safeParse(body.priorityId).success) {
        return reply.status(400).send({ error: 'Invalid priorityId format' });
      }
      if (!config.priorities.some(p => p.id === body.priorityId)) {
        return reply.status(400).send({
          error: 'Priority not found or inactive', code: 'not-found',
        });
      }
    }

    // Validate & resolve statusId (S1, S2)
    if (body.statusId !== undefined) {
      if (!z.string().uuid().safeParse(body.statusId).success) {
        return reply.status(400).send({ error: 'Invalid statusId format' });
      }
      if (!config.statuses.some(s => s.id === body.statusId)) {
        return reply.status(400).send({
          error: 'Status not found or inactive', code: 'not-found',
        });
      }
    }

    // Resolve defaults for missing IDs (S5 — active default per Workspace)
    const resolvedTicketTypeId = body.ticketTypeId
      ?? config.ticketTypes.find(t => t.isDefault)?.id
      ?? null;
    if (resolvedTicketTypeId === null) {
      return reply.status(400).send({
        error: 'ticketTypeId is required',
        code: 'not-found',
        details: 'No default ticket type and no value provided — selection is required',
      });
    }

    const resolvedPriorityId = body.priorityId
      ?? config.priorities.find(p => p.isDefault)?.id
      ?? null;
    if (resolvedPriorityId === null) {
      return reply.status(400).send({
        error: 'priorityId is required',
        code: 'not-found',
        details: 'No default priority and no value provided — selection is required',
      });
    }

    // Create ticket (DB validates workspace ownership; catch maps to 400)
    try {
      const ticketModule = getTicket();
      const ticket = await ticketModule.createTicket({
        workspaceId,
        title: body.title,
        description: body.description ?? null,
        statusId: body.statusId,
        priority: (body.priority as any) ?? 'normal',
        priorityId: resolvedPriorityId,
        ticketTypeId: resolvedTicketTypeId,
        createdBy: session.userId,
        assignedTo: body.assignedTo ?? null,
      });

      // Append system event to timeline
      await ticketModule.appendTimelineEntry({
        ticketId: ticket.id,
        kind: 'system_event',
        content: `Ticket created by ${session.userId}`,
        authorId: null,
        visibility: 'public',
      });

      // Audit event
      const audit = getAudit();
      await audit.append({
        kind: 'ticket-created',
        actorUserId: session.userId,
        workspaceId,
        details: { ticketId: ticket.id, title: body.title },
      });

      return reply.send(ticket);
    } catch (err) {
      if (err instanceof ConfigurationNotFoundError) {
        return reply.status(400).send({
          error: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  });

  // PUT /api/tickets/:id — update ticket
  fastify.put('/api/tickets/:id', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const ticketId = (request.params as { id: string }).id;
    const body = request.body as {
      title?: string;
      description?: string;
      statusId?: string;
      priority?: string;
      priorityId?: string;
      assignedTo?: string;
    };

    const ticketModule = getTicket();
    const ticket = await ticketModule.getTicket(workspaceId, ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasUpdate = await identity.hasCapability(
      session.userId,
      ticket.workspaceId,
      'tickets:update',
    );
    if (!hasUpdate) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // S2: the status change is a Workspace-configured Status id.
    if (body.statusId !== undefined) {
      if (!z.string().uuid().safeParse(body.statusId).success) {
        return reply.status(400).send({ error: 'Invalid statusId format' });
      }
    }

    try {
      const updated = await ticketModule.updateTicket({
        id: ticket.id,
        title: body.title,
        description: body.description,
        statusId: body.statusId,
        priority: body.priority as any,
        priorityId: body.priorityId ?? undefined,
        assignedTo: body.assignedTo,
      });

      return reply.send(updated);
    } catch (err) {
      // S2: a Status change the Workspace transitions do not permit is a client
      // error with a stable code, not a 500.
      if (err instanceof ConfigurationValidationError) {
        return reply.status(400).send({
          error: err.message,
          code: err.code,
        });
      }
      if (err instanceof ConfigurationNotFoundError) {
        return reply.status(400).send({
          error: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  });

  // GET /api/tickets/:id/timeline — get timeline entries
  fastify.get('/api/tickets/:id/timeline', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = getTicket();

    const ticket = await ticketModule.getTicket(workspaceId, ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasAccess = await identity.hasCapability(
      session.userId,
      ticket.workspaceId,
      'tickets:read',
    );
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Requesters cannot see internal entries
    const canSeeInternal = await identity.hasCapability(
      session.userId,
      ticket.workspaceId,
      'tickets:internal-note',
    );

    const entries = await ticketModule.getTimeline(ticketId, {
      visibility: canSeeInternal ? undefined : 'public',
    });
    return reply.send(entries);
  });

  // POST /api/tickets/:id/timeline — append timeline entry
  fastify.post('/api/tickets/:id/timeline', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const ticketId = (request.params as { id: string }).id;
    const body = request.body as {
      kind: string;
      content: string;
      visibility?: string;
    };

    if (!body.kind || !body.content) {
      return reply.status(400).send({ error: 'kind and content are required' });
    }

    const ticketModule = getTicket();
    const ticket = await ticketModule.getTicket(workspaceId, ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const entry = await ticketModule.appendTimelineEntry({
      ticketId,
      kind: body.kind as any,
      content: body.content,
      authorId: session.userId,
      visibility: (body.visibility as any) || 'public',
    });

    return reply.send(entry);
  });

  // POST /api/tickets/:id/claim — claim ticket (agent)
  fastify.post('/api/tickets/:id/claim', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const identity = getIdentity();
    const session = await identity.getSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const workspaceId = session.workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace selected' });
    }

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = getTicket();

    const ticket = await ticketModule.getTicket(workspaceId, ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasClaim = await identity.hasCapability(
      session.userId,
      ticket.workspaceId,
      'tickets:assign',
    );
    if (!hasClaim) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await ticketModule.updateTicket({
      id: ticket.id,
      assignedTo: session.userId,
    });

    await ticketModule.appendTimelineEntry({
      ticketId,
      kind: 'assignment_change',
      content: `Ticket claimed by ${session.userId}`,
      authorId: session.userId,
      visibility: 'public',
    });

    return reply.send(updated);
  });
}
