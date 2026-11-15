import type { FastifyInstance } from 'fastify';

/**
 * Installation status endpoint. It lives under /api so that the root path stays
 * available for the browser portal, which owns '/'.
 */
export async function registerRootRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api', async (_request, reply) => {
    return reply.send({
      name: 'ticketOS',
      version: '0.0.1',
      status: 'experimental',
      links: {
        health: '/health',
        ready: '/ready',
      },
    });
  });
}
