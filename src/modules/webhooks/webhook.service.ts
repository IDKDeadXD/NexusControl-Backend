import { prisma } from '../../utils/database.js';
import { EventType } from '@prisma/client';
import { logger } from '../../utils/logger.js';

export interface WebhookPayload {
  event: EventType;
  bot: {
    id: string;
    name: string;
    status: string;
  };
  timestamp: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  enabled?: boolean;
  events: EventType[];
  botIds?: string[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  enabled?: boolean;
  events?: EventType[];
  botIds?: string[];
}

// Discord webhook embed colors
const EVENT_COLORS: Record<EventType, number> = {
  BOT_STARTED: 0x22c55e, // Green
  BOT_STOPPED: 0x6b7280, // Gray
  BOT_CRASHED: 0xef4444, // Red
  BOT_ERROR: 0xf59e0b, // Orange
  BOT_RESTARTED: 0x3b82f6, // Blue
  BOT_CREATED: 0x8b5cf6, // Purple
  BOT_DELETED: 0xec4899, // Pink
};

const EVENT_TITLES: Record<EventType, string> = {
  BOT_STARTED: 'Bot Started',
  BOT_STOPPED: 'Bot Stopped',
  BOT_CRASHED: 'Bot Crashed',
  BOT_ERROR: 'Bot Error',
  BOT_RESTARTED: 'Bot Restarted',
  BOT_CREATED: 'Bot Created',
  BOT_DELETED: 'Bot Deleted',
};

export async function getAllWebhooks() {
  return prisma.webhook.findMany({
    include: {
      events: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWebhook(id: string) {
  return prisma.webhook.findUnique({
    where: { id },
    include: {
      events: true,
    },
  });
}

export async function createWebhook(input: CreateWebhookInput) {
  return prisma.webhook.create({
    data: {
      name: input.name,
      url: input.url,
      enabled: input.enabled ?? true,
      botIds: input.botIds ?? [],
      events: {
        create: input.events.map((event) => ({ event })),
      },
    },
    include: {
      events: true,
    },
  });
}

export async function updateWebhook(id: string, input: UpdateWebhookInput) {
  // If events are being updated, delete existing and create new
  if (input.events) {
    await prisma.webhookEvent.deleteMany({
      where: { webhookId: id },
    });
  }

  return prisma.webhook.update({
    where: { id },
    data: {
      name: input.name,
      url: input.url,
      enabled: input.enabled,
      botIds: input.botIds,
      events: input.events
        ? {
            create: input.events.map((event) => ({ event })),
          }
        : undefined,
    },
    include: {
      events: true,
    },
  });
}

export async function deleteWebhook(id: string) {
  return prisma.webhook.delete({
    where: { id },
  });
}

export async function testWebhook(id: string) {
  const webhook = await getWebhook(id);
  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload: WebhookPayload = {
    event: 'BOT_STARTED' as EventType,
    bot: {
      id: 'test-bot-id',
      name: 'Test Bot',
      status: 'RUNNING',
    },
    timestamp: new Date().toISOString(),
    message: 'This is a test notification from Bot Manager',
    details: {
      test: true,
    },
  };

  return sendWebhookNotification(webhook.url, testPayload);
}

export async function sendWebhookNotification(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  try {
    // Check if it's a Discord webhook
    const isDiscordWebhook = webhookUrl.includes('discord.com/api/webhooks');

    let body: unknown;

    if (isDiscordWebhook) {
      // Format for Discord
      body = {
        embeds: [
          {
            title: EVENT_TITLES[payload.event] || payload.event,
            description: payload.message,
            color: EVENT_COLORS[payload.event] || 0x5865f2,
            fields: [
              {
                name: 'Bot',
                value: payload.bot.name,
                inline: true,
              },
              {
                name: 'Status',
                value: payload.bot.status,
                inline: true,
              },
            ],
            footer: {
              text: 'Bot Manager',
            },
            timestamp: payload.timestamp,
          },
        ],
      };
    } else {
      // Generic webhook format
      body = payload;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, url: webhookUrl },
        'Webhook notification failed'
      );
      return false;
    }

    logger.info({ event: payload.event, bot: payload.bot.name }, 'Webhook notification sent');
    return true;
  } catch (error) {
    logger.error({ error, url: webhookUrl }, 'Failed to send webhook notification');
    return false;
  }
}

export async function triggerWebhooks(
  event: EventType,
  bot: { id: string; name: string; status: string },
  message: string,
  details?: Record<string, unknown>
) {
  // Find all enabled webhooks subscribed to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      enabled: true,
      events: {
        some: {
          event,
        },
      },
      OR: [
        { botIds: { isEmpty: true } }, // All bots
        { botIds: { has: bot.id } }, // Specific bot
      ],
    },
    include: {
      events: true,
    },
  });

  if (webhooks.length === 0) {
    return;
  }

  const payload: WebhookPayload = {
    event,
    bot,
    timestamp: new Date().toISOString(),
    message,
    details,
  };

  // Send notifications in parallel
  await Promise.allSettled(
    webhooks.map((webhook) => sendWebhookNotification(webhook.url, payload))
  );
}
