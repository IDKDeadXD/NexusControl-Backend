import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as analyticsService from './analytics.service.js';
import * as dockerService from '../docker/docker.service.js';
import { authenticate } from '../../middleware/authenticate.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // Get overview analytics
  app.get('/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const analytics = await analyticsService.getOverviewAnalytics();
      return reply.send({ success: true, data: analytics });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to get analytics',
      });
    }
  });

  // Get bot-specific analytics
  app.get(
    '/bots/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { hours?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const hours = parseInt(request.query.hours || '24', 10);
        const analytics = await analyticsService.getBotAnalytics(
          request.params.id,
          hours
        );
        return reply.send({ success: true, data: analytics });
      } catch (error) {
        return reply.status(404).send({
          success: false,
          error: 'Bot not found',
        });
      }
    }
  );

  // Get system stats (Docker health, resource usage)
  app.get('/system', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await dockerService.getSystemStats();
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to get system stats',
      });
    }
  });
}
