import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../../utils/jwt.js';
import { prisma } from '../../utils/database.js';
import * as dockerService from '../docker/docker.service.js';
import { logger } from '../../utils/logger.js';

const activeSubscriptions = new Map<string, Map<string, () => void>>();

export function setupWebSocket(io: Server): void {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyAccessToken(token);
      const admin = await prisma.admin.findUnique({
        where: { id: decoded.adminId },
      });

      if (!admin) {
        return next(new Error('User not found'));
      }

      (socket as any).user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to WebSocket');

    // Initialize subscription map for this socket
    activeSubscriptions.set(socket.id, new Map());

    // Subscribe to bot logs
    socket.on('subscribe:logs', async (data: { botId: string }) => {
      try {
        const bot = await prisma.bot.findUnique({
          where: { id: data.botId },
        });

        if (!bot || !bot.containerId) {
          socket.emit('error', { message: 'Bot not found or not running' });
          return;
        }

        // Unsubscribe from previous subscription for this bot
        const subscriptions = activeSubscriptions.get(socket.id);
        const existingCleanup = subscriptions?.get(data.botId);
        if (existingCleanup) {
          existingCleanup();
        }

        // Start streaming logs
        const cleanup = dockerService.streamContainerLogs(
          bot.containerId,
          (log) => {
            socket.emit('bot:log', {
              botId: data.botId,
              log,
              timestamp: new Date().toISOString(),
            });
          },
          (error) => {
            logger.error({ error, botId: data.botId }, 'Log stream error');
            socket.emit('bot:error', {
              botId: data.botId,
              error: error.message,
            });
          }
        );

        subscriptions?.set(data.botId, cleanup);
        logger.info({ socketId: socket.id, botId: data.botId }, 'Subscribed to logs');
      } catch (error) {
        logger.error({ error }, 'Failed to subscribe to logs');
        socket.emit('error', { message: 'Failed to subscribe to logs' });
      }
    });

    // Unsubscribe from bot logs
    socket.on('unsubscribe:logs', (data: { botId: string }) => {
      const subscriptions = activeSubscriptions.get(socket.id);
      const cleanup = subscriptions?.get(data.botId);
      if (cleanup) {
        cleanup();
        subscriptions?.delete(data.botId);
        logger.info({ socketId: socket.id, botId: data.botId }, 'Unsubscribed from logs');
      }
    });

    // Subscribe to all bot status updates
    socket.on('subscribe:status', () => {
      socket.join('bot-status');
      logger.info({ socketId: socket.id }, 'Subscribed to status updates');
    });

    socket.on('unsubscribe:status', () => {
      socket.leave('bot-status');
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      const subscriptions = activeSubscriptions.get(socket.id);
      if (subscriptions) {
        for (const cleanup of subscriptions.values()) {
          cleanup();
        }
        activeSubscriptions.delete(socket.id);
      }
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });
}

// Broadcast status change to all subscribed clients
export function broadcastStatusChange(
  io: Server,
  botId: string,
  status: string,
  containerId?: string
): void {
  io.to('bot-status').emit('bot:status', {
    botId,
    status,
    containerId,
    timestamp: new Date().toISOString(),
  });
}
