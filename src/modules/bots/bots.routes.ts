import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createBotSchema, updateBotSchema, envVarSchema } from './bots.schema.js';
import * as botsService from './bots.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { logger } from '../../utils/logger.js';

export async function botsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // List all bots
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const bots = await botsService.getBots();
    return reply.send({ success: true, data: bots });
  });

  // Create bot
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createBotSchema.parse(request.body);
      const bot = await botsService.createBot(body);
      return reply.status(201).send({ success: true, data: bot });
    } catch (error) {
      logger.error({ error }, 'Failed to create bot');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create bot',
      });
    }
  });

  // Get single bot
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const bot = await botsService.getBot(request.params.id);
      return reply.send({ success: true, data: bot });
    } catch (error) {
      return reply.status(404).send({
        success: false,
        error: 'Bot not found',
      });
    }
  });

  // Update bot
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = updateBotSchema.parse(request.body);
      const bot = await botsService.updateBot(request.params.id, body);
      return reply.send({ success: true, data: bot });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update bot',
      });
    }
  });

  // Delete bot
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await botsService.deleteBot(request.params.id);
      return reply.send({ success: true, message: 'Bot deleted' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete bot',
      });
    }
  });

  // Start bot
  app.post('/:id/start', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await botsService.startBot(request.params.id);
      return reply.send({ success: true, message: 'Bot started' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start bot',
      });
    }
  });

  // Stop bot
  app.post('/:id/stop', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await botsService.stopBot(request.params.id);
      return reply.send({ success: true, message: 'Bot stopped' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop bot',
      });
    }
  });

  // Restart bot
  app.post('/:id/restart', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await botsService.restartBot(request.params.id);
      return reply.send({ success: true, message: 'Bot restarted' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restart bot',
      });
    }
  });

  // Get bot status
  app.get('/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const status = await botsService.getBotStatus(request.params.id);
      return reply.send({ success: true, data: status });
    } catch (error) {
      return reply.status(404).send({
        success: false,
        error: 'Bot not found',
      });
    }
  });

  // Get bot logs
  app.get('/:id/logs', async (request: FastifyRequest<{ Params: { id: string }; Querystring: { tail?: string } }>, reply: FastifyReply) => {
    try {
      const tail = parseInt(request.query.tail || '100', 10);
      const logs = await botsService.getBotLogs(request.params.id, tail);
      return reply.send({ success: true, data: logs });
    } catch (error) {
      return reply.status(404).send({
        success: false,
        error: 'Bot not found',
      });
    }
  });

  // Environment Variables
  app.get('/:id/env', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const envVars = await botsService.getEnvVars(request.params.id);
      return reply.send({ success: true, data: envVars });
    } catch (error) {
      return reply.status(404).send({
        success: false,
        error: 'Bot not found',
      });
    }
  });

  app.post('/:id/env', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = envVarSchema.parse(request.body);
      const envVar = await botsService.addEnvVar(request.params.id, body);
      return reply.status(201).send({ success: true, data: envVar });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add env var',
      });
    }
  });

  app.patch('/:id/env/:key', async (request: FastifyRequest<{ Params: { id: string; key: string }; Body: { value: string } }>, reply: FastifyReply) => {
    try {
      const { value } = request.body as { value: string };
      const envVar = await botsService.updateEnvVar(request.params.id, request.params.key, value);
      return reply.send({ success: true, data: envVar });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update env var',
      });
    }
  });

  app.delete('/:id/env/:key', async (request: FastifyRequest<{ Params: { id: string; key: string } }>, reply: FastifyReply) => {
    try {
      await botsService.deleteEnvVar(request.params.id, request.params.key);
      return reply.send({ success: true, message: 'Env var deleted' });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete env var',
      });
    }
  });
}
