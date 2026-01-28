import { prisma } from '../../utils/database.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { config } from '../../config/index.js';
import { CreateBotInput, UpdateBotInput, EnvVarInput } from './bots.schema.js';
import * as dockerService from '../docker/docker.service.js';
import { triggerWebhooks } from '../webhooks/webhook.service.js';
import { BotStatus } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

function generateContainerName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  const suffix = crypto.randomBytes(4).toString('hex');
  return `bot_${slug}_${suffix}`;
}

export async function createBot(input: CreateBotInput) {
  const containerName = generateContainerName(input.name);
  const codeDirectory = path.resolve(config.BOT_CODE_PATH, containerName);

  // Create code directory
  await fs.mkdir(codeDirectory, { recursive: true });

  const bot = await prisma.bot.create({
    data: {
      name: input.name,
      description: input.description,
      containerName,
      codeDirectory,
      runtime: input.runtime,
      entryFile: input.entryFile,
      startCommand: input.startCommand,
      autoRestart: input.autoRestart,
      memoryLimit: input.memoryLimit,
      cpuLimit: input.cpuLimit,
    },
  });

  logger.info({ botId: bot.id, name: bot.name }, 'Bot instance created');

  // Trigger webhook
  triggerWebhooks(
    'BOT_CREATED',
    { id: bot.id, name: bot.name, status: bot.status },
    `Bot "${bot.name}" has been created`
  ).catch(() => {}); // Don't block on webhook failures

  return bot;
}

export async function getBots() {
  const bots = await prisma.bot.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      containerName: true,
      status: true,
      runtime: true,
      autoRestart: true,
      memoryLimit: true,
      cpuLimit: true,
      createdAt: true,
      lastStartedAt: true,
      lastStoppedAt: true,
    },
  });

  return bots;
}

export async function getBot(id: string) {
  const bot = await prisma.bot.findUnique({
    where: { id },
    include: {
      envVars: {
        select: {
          id: true,
          key: true,
        },
      },
    },
  });

  if (!bot) {
    throw new Error('Bot not found');
  }

  return bot;
}

export async function updateBot(id: string, input: UpdateBotInput) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  const updatedBot = await prisma.bot.update({
    where: { id },
    data: input,
  });

  logger.info({ botId: id }, 'Bot updated');
  return updatedBot;
}

export async function deleteBot(id: string) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  // Stop and remove container if exists
  if (bot.containerId) {
    try {
      await dockerService.removeContainer(bot.containerId);
    } catch (error) {
      logger.warn({ error, botId: id }, 'Failed to remove container during bot deletion');
    }
  }

  // Remove code directory
  try {
    await fs.rm(bot.codeDirectory, { recursive: true, force: true });
  } catch (error) {
    logger.warn({ error, botId: id }, 'Failed to remove code directory');
  }

  // Delete bot from database
  await prisma.bot.delete({ where: { id } });

  logger.info({ botId: id }, 'Bot deleted');

  // Trigger webhook
  triggerWebhooks(
    'BOT_DELETED',
    { id: bot.id, name: bot.name, status: 'DELETED' },
    `Bot "${bot.name}" has been deleted`
  ).catch(() => {}); // Don't block on webhook failures
}

export async function startBot(id: string) {
  const bot = await prisma.bot.findUnique({
    where: { id },
    include: { envVars: true },
  });

  if (!bot) {
    throw new Error('Bot not found');
  }

  if (bot.status === 'RUNNING') {
    throw new Error('Bot is already running');
  }

  // Update status to starting
  await updateBotStatus(id, 'STARTING');

  try {
    // Decrypt env vars
    const envVars = bot.envVars.map((e) => ({
      key: e.key,
      value: decrypt(e.value),
    }));

    // Remove old container if exists
    if (bot.containerId) {
      await dockerService.removeContainer(bot.containerId);
    }

    // Create and start new container
    const containerId = await dockerService.createContainer(bot, envVars);
    await dockerService.startContainer(containerId);

    // Update bot with new container ID
    await prisma.bot.update({
      where: { id },
      data: {
        containerId,
        status: 'RUNNING',
        lastStartedAt: new Date(),
      },
    });

    await recordStatusHistory(id, 'RUNNING');
    logger.info({ botId: id, containerId }, 'Bot started');

    // Trigger webhook
    triggerWebhooks(
      'BOT_STARTED',
      { id: bot.id, name: bot.name, status: 'RUNNING' },
      `Bot "${bot.name}" has started successfully`
    ).catch(() => {});
  } catch (error) {
    await updateBotStatus(id, 'ERROR');

    // Trigger error webhook
    triggerWebhooks(
      'BOT_ERROR',
      { id: bot.id, name: bot.name, status: 'ERROR' },
      `Bot "${bot.name}" failed to start`,
      { error: String(error) }
    ).catch(() => {});

    throw error;
  }
}

export async function stopBot(id: string) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  if (!bot.containerId) {
    throw new Error('Bot has no container');
  }

  await updateBotStatus(id, 'STOPPING');

  try {
    await dockerService.stopContainer(bot.containerId);

    await prisma.bot.update({
      where: { id },
      data: {
        status: 'STOPPED',
        lastStoppedAt: new Date(),
      },
    });

    await recordStatusHistory(id, 'STOPPED');
    logger.info({ botId: id }, 'Bot stopped');

    // Trigger webhook
    triggerWebhooks(
      'BOT_STOPPED',
      { id: bot.id, name: bot.name, status: 'STOPPED' },
      `Bot "${bot.name}" has been stopped`
    ).catch(() => {});
  } catch (error) {
    await updateBotStatus(id, 'ERROR');

    // Trigger error webhook
    triggerWebhooks(
      'BOT_ERROR',
      { id: bot.id, name: bot.name, status: 'ERROR' },
      `Bot "${bot.name}" failed to stop`,
      { error: String(error) }
    ).catch(() => {});

    throw error;
  }
}

export async function restartBot(id: string) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  if (!bot.containerId) {
    throw new Error('Bot has no container');
  }

  await updateBotStatus(id, 'RESTARTING');

  try {
    await dockerService.restartContainer(bot.containerId);

    await prisma.bot.update({
      where: { id },
      data: {
        status: 'RUNNING',
        lastStartedAt: new Date(),
      },
    });

    await recordStatusHistory(id, 'RUNNING');
    logger.info({ botId: id }, 'Bot restarted');

    // Trigger webhook
    triggerWebhooks(
      'BOT_RESTARTED',
      { id: bot.id, name: bot.name, status: 'RUNNING' },
      `Bot "${bot.name}" has been restarted`
    ).catch(() => {});
  } catch (error) {
    await updateBotStatus(id, 'ERROR');

    // Trigger error webhook
    triggerWebhooks(
      'BOT_ERROR',
      { id: bot.id, name: bot.name, status: 'ERROR' },
      `Bot "${bot.name}" failed to restart`,
      { error: String(error) }
    ).catch(() => {});

    throw error;
  }
}

export async function getBotStatus(id: string) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  let containerStatus = null;
  let stats = null;

  if (bot.containerId) {
    containerStatus = await dockerService.getContainerStatus(bot.containerId);
    if (containerStatus === 'running') {
      stats = await dockerService.getContainerStats(bot.containerId);
    }
  }

  return {
    status: bot.status,
    containerStatus,
    stats,
    memoryLimit: bot.memoryLimit,
    cpuLimit: bot.cpuLimit,
    lastStartedAt: bot.lastStartedAt,
    lastStoppedAt: bot.lastStoppedAt,
  };
}

export async function getBotLogs(id: string, tail: number = 100) {
  const bot = await prisma.bot.findUnique({ where: { id } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  if (!bot.containerId) {
    return [];
  }

  return dockerService.getContainerLogs(bot.containerId, tail);
}

// Environment Variables
export async function getEnvVars(botId: string) {
  const envVars = await prisma.botEnvVar.findMany({
    where: { botId },
    select: {
      id: true,
      key: true,
    },
  });

  return envVars;
}

export async function addEnvVar(botId: string, input: EnvVarInput) {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  const envVar = await prisma.botEnvVar.create({
    data: {
      botId,
      key: input.key,
      value: encrypt(input.value),
    },
    select: {
      id: true,
      key: true,
    },
  });

  logger.info({ botId, key: input.key }, 'Env var added');
  return envVar;
}

export async function updateEnvVar(botId: string, key: string, value: string) {
  const envVar = await prisma.botEnvVar.update({
    where: {
      botId_key: { botId, key },
    },
    data: {
      value: encrypt(value),
    },
    select: {
      id: true,
      key: true,
    },
  });

  logger.info({ botId, key }, 'Env var updated');
  return envVar;
}

export async function deleteEnvVar(botId: string, key: string) {
  await prisma.botEnvVar.delete({
    where: {
      botId_key: { botId, key },
    },
  });

  logger.info({ botId, key }, 'Env var deleted');
}

// Helper functions
async function updateBotStatus(id: string, status: BotStatus) {
  await prisma.bot.update({
    where: { id },
    data: { status },
  });
}

async function recordStatusHistory(botId: string, status: BotStatus) {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });

  let stats = null;
  if (bot?.containerId && status === 'RUNNING') {
    stats = await dockerService.getContainerStats(bot.containerId);
  }

  await prisma.botStatusHistory.create({
    data: {
      botId,
      status,
      cpuUsage: stats?.cpuUsage,
      memoryUsage: stats?.memoryUsage,
    },
  });
}
