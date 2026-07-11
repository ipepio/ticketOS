import type { FastifyInstance } from 'fastify';

/**
 * Root endpoint — returns installation status and version information.
 */
export async function registerRootRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
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
