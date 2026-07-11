import type { FastifyInstance } from 'fastify';
import { getIdentity } from '../app.js';

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

    // Check capability
    const hasAccess = await identity.hasCapability(session.userId, workspaceId, 'tickets:read');
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const { status, priority, assignedTo } = request.query as {
      status?: string;
      priority?: string;
      assignedTo?: string;
    };

    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
    }

    const tickets = await ticketModule.listTickets(workspaceId, {
      status: status as any,
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

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
    }

    const ticket = await ticketModule.getTicket(ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    // Check workspace access
    const hasAccess = await identity.hasCapability(session.userId, ticket.workspaceId, 'tickets:read');
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    return reply.send(ticket);
  });

  // POST /api/tickets — create ticket
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

    const hasCreate = await identity.hasCapability(session.userId, workspaceId, 'tickets:create');
    if (!hasCreate) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const body = request.body as {
      title: string;
      description?: string;
      priority?: string;
      ticketTypeId?: string;
      assignedTo?: string;
    };

    if (!body.title) {
      return reply.status(400).send({ error: 'title is required' });
    }

    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
    }

    const ticket = await ticketModule.createTicket({
      workspaceId,
      title: body.title,
      description: body.description || null,
      priority: (body.priority as any) || 'normal',
      ticketTypeId: body.ticketTypeId || null,
      createdBy: session.userId,
      assignedTo: body.assignedTo || null,
    });

    // Append system event to timeline
    await ticketModule.appendTimelineEntry({
      ticketId: ticket.id,
      kind: 'system_event',
      content: `Ticket created by ${session.userId}`,
      authorId: null,
      visibility: 'public',
    });

    return reply.send(ticket);
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

    const ticketId = (request.params as { id: string }).id;
    const body = request.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assignedTo?: string;
    };

    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
    }

    const ticket = await ticketModule.getTicket(ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasUpdate = await identity.hasCapability(session.userId, ticket.workspaceId, 'tickets:update');
    if (!hasUpdate) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await ticketModule.updateTicket({
      id: ticket.id,
      title: body.title,
      description: body.description,
      status: body.status as any,
      priority: body.priority as any,
      assignedTo: body.assignedTo,
    });

    return reply.send(updated);
  });

  // GET /api/tickets/:id/timeline — get timeline entries
  fastify.get('/api/tickets/:id/timeline', async (request, reply) => {
    const sessionId = request.cookies.sessionId;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
    }

    const entries = await ticketModule.getTimeline(ticketId);
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

    const ticketId = (request.params as { id: string }).id;
    const body = request.body as {
      kind: string;
      content: string;
      visibility?: string;
    };

    if (!body.kind || !body.content) {
      return reply.status(400).send({ error: 'kind and content are required' });
    }

    const ticketModule = (fastify as any).ticketModule;
    if (!ticketModule) {
      return reply.status(503).send({ error: 'Ticket module not available' });
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

    const ticketId = (request.params as { id: string }).id;
    const ticketModule = (fastify as any).ticketModule;
    const workflowModule = (fastify as any).workflowModule;
    if (!ticketModule || !workflowModule) {
      return reply.status(503).send({ error: 'Required module not available' });
    }

    const ticket = await ticketModule.getTicket(ticketId);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const hasClaim = await identity.hasCapability(session.userId, ticket.workspaceId, 'tickets:assign');
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
