import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EventType } from '@prisma/client';
import * as webhookService from './webhook.service.js';
import { authenticate } from '../../middleware/authenticate.js';

interface CreateWebhookBody {
  name: string;
  url: string;
  enabled?: boolean;
  events: EventType[];
  botIds?: string[];
}

interface UpdateWebhookBody {
  name?: string;
  url?: string;
  enabled?: boolean;
  events?: EventType[];
  botIds?: string[];
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // Get all webhooks
  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const webhooks = await webhookService.getAllWebhooks();
      return reply.send({ success: true, data: webhooks });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to get webhooks',
      });
    }
  });

  // Get single webhook
  app.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const webhook = await webhookService.getWebhook(request.params.id);
        if (!webhook) {
          return reply.status(404).send({
            success: false,
            error: 'Webhook not found',
          });
        }
        return reply.send({ success: true, data: webhook });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to get webhook',
        });
      }
    }
  );

  // Create webhook
  app.post(
    '/',
    async (
      request: FastifyRequest<{ Body: CreateWebhookBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, url, enabled, events, botIds } = request.body;

        if (!name || !url || !events || events.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Name, URL, and at least one event are required',
          });
        }

        // Validate URL
        try {
          new URL(url);
        } catch {
          return reply.status(400).send({
            success: false,
            error: 'Invalid webhook URL',
          });
        }

        const webhook = await webhookService.createWebhook({
          name,
          url,
          enabled,
          events,
          botIds,
        });

        return reply.status(201).send({ success: true, data: webhook });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to create webhook',
        });
      }
    }
  );

  // Update webhook
  app.patch(
    '/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateWebhookBody;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, url, enabled, events, botIds } = request.body;

        // Validate URL if provided
        if (url) {
          try {
            new URL(url);
          } catch {
            return reply.status(400).send({
              success: false,
              error: 'Invalid webhook URL',
            });
          }
        }

        const webhook = await webhookService.updateWebhook(request.params.id, {
          name,
          url,
          enabled,
          events,
          botIds,
        });

        return reply.send({ success: true, data: webhook });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to update webhook',
        });
      }
    }
  );

  // Delete webhook
  app.delete(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        await webhookService.deleteWebhook(request.params.id);
        return reply.send({ success: true });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to delete webhook',
        });
      }
    }
  );

  // Test webhook
  app.post(
    '/:id/test',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const success = await webhookService.testWebhook(request.params.id);
        if (success) {
          return reply.send({
            success: true,
            message: 'Test notification sent successfully',
          });
        } else {
          return reply.status(500).send({
            success: false,
            error: 'Failed to send test notification',
          });
        }
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: error.message || 'Failed to test webhook',
        });
      }
    }
  );

  // Get available event types
  app.get('/events/types', async (_request: FastifyRequest, reply: FastifyReply) => {
    const eventTypes = [
      { value: 'BOT_STARTED', label: 'Bot Started', description: 'When a bot starts running' },
      { value: 'BOT_STOPPED', label: 'Bot Stopped', description: 'When a bot is stopped' },
      { value: 'BOT_CRASHED', label: 'Bot Crashed', description: 'When a bot crashes unexpectedly' },
      { value: 'BOT_ERROR', label: 'Bot Error', description: 'When a bot encounters an error' },
      { value: 'BOT_RESTARTED', label: 'Bot Restarted', description: 'When a bot is restarted' },
      { value: 'BOT_CREATED', label: 'Bot Created', description: 'When a new bot is created' },
      { value: 'BOT_DELETED', label: 'Bot Deleted', description: 'When a bot is deleted' },
    ];
    return reply.send({ success: true, data: eventTypes });
  });
}
