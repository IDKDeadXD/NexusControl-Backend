import { prisma } from '../../utils/database.js';
import * as dockerService from '../docker/docker.service.js';
import { BotStatus } from '@prisma/client';

export interface BotAnalytics {
  botId: string;
  uptime: number; // percentage
  totalRuntime: number; // hours
  statusHistory: {
    timestamp: Date;
    status: BotStatus;
    cpuUsage: number | null;
    memoryUsage: number | null;
  }[];
  averageCpu: number;
  averageMemory: number;
}

export interface OverviewAnalytics {
  totalBots: number;
  runningBots: number;
  stoppedBots: number;
  errorBots: number;
  totalUptime: number; // average percentage across all bots
  recentActivity: {
    botId: string;
    botName: string;
    status: BotStatus;
    timestamp: Date;
  }[];
}

export async function getBotAnalytics(
  botId: string,
  hoursBack: number = 24
): Promise<BotAnalytics> {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });

  if (!bot) {
    throw new Error('Bot not found');
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  // Get status history
  const statusHistory = await prisma.botStatusHistory.findMany({
    where: {
      botId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'asc' },
  });

  // Calculate uptime percentage
  let runningTime = 0;
  let lastRunningStart: Date | null = null;

  for (const entry of statusHistory) {
    if (entry.status === 'RUNNING' && !lastRunningStart) {
      lastRunningStart = entry.timestamp;
    } else if (entry.status !== 'RUNNING' && lastRunningStart) {
      runningTime += entry.timestamp.getTime() - lastRunningStart.getTime();
      lastRunningStart = null;
    }
  }

  // If still running, count until now
  if (lastRunningStart) {
    runningTime += Date.now() - lastRunningStart.getTime();
  }

  const totalTime = Date.now() - since.getTime();
  const uptime = totalTime > 0 ? (runningTime / totalTime) * 100 : 0;

  // Calculate averages
  const statsWithData = statusHistory.filter(
    (s) => s.cpuUsage !== null && s.memoryUsage !== null
  );

  const averageCpu =
    statsWithData.length > 0
      ? statsWithData.reduce((sum, s) => sum + (s.cpuUsage || 0), 0) /
        statsWithData.length
      : 0;

  const averageMemory =
    statsWithData.length > 0
      ? statsWithData.reduce((sum, s) => sum + (s.memoryUsage || 0), 0) /
        statsWithData.length
      : 0;

  return {
    botId,
    uptime: Math.round(uptime * 100) / 100,
    totalRuntime: Math.round((runningTime / (1000 * 60 * 60)) * 100) / 100,
    statusHistory: statusHistory.map((s) => ({
      timestamp: s.timestamp,
      status: s.status,
      cpuUsage: s.cpuUsage,
      memoryUsage: s.memoryUsage,
    })),
    averageCpu: Math.round(averageCpu * 100) / 100,
    averageMemory: Math.round(averageMemory * 100) / 100,
  };
}

export async function getOverviewAnalytics(): Promise<OverviewAnalytics> {
  const bots = await prisma.bot.findMany({
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  const totalBots = bots.length;
  const runningBots = bots.filter((b) => b.status === 'RUNNING').length;
  const stoppedBots = bots.filter((b) => b.status === 'STOPPED').length;
  const errorBots = bots.filter((b) => b.status === 'ERROR').length;

  // Get recent activity
  const recentActivity = await prisma.botStatusHistory.findMany({
    take: 10,
    orderBy: { timestamp: 'desc' },
    include: {
      bot: {
        select: { name: true },
      },
    },
  });

  // Calculate average uptime across all bots
  let totalUptime = 0;
  if (bots.length > 0) {
    const uptimes = await Promise.all(
      bots.map(async (bot) => {
        try {
          const analytics = await getBotAnalytics(bot.id, 24);
          return analytics.uptime;
        } catch {
          return 0;
        }
      })
    );
    totalUptime = uptimes.reduce((a, b) => a + b, 0) / uptimes.length;
  }

  return {
    totalBots,
    runningBots,
    stoppedBots,
    errorBots,
    totalUptime: Math.round(totalUptime * 100) / 100,
    recentActivity: recentActivity.map((a) => ({
      botId: a.botId,
      botName: a.bot.name,
      status: a.status,
      timestamp: a.timestamp,
    })),
  };
}

export async function recordBotStats(): Promise<void> {
  // Get all running bots and record their stats
  const runningBots = await prisma.bot.findMany({
    where: { status: 'RUNNING', containerId: { not: null } },
  });

  for (const bot of runningBots) {
    if (!bot.containerId) continue;

    try {
      const stats = await dockerService.getContainerStats(bot.containerId);
      if (stats) {
        await prisma.botStatusHistory.create({
          data: {
            botId: bot.id,
            status: 'RUNNING',
            cpuUsage: stats.cpuUsage,
            memoryUsage: stats.memoryUsage,
          },
        });
      }
    } catch (error) {
      // Ignore errors for individual bots
    }
  }
}
