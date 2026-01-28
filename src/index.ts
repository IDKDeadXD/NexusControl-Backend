import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './utils/database.js';
import { recordBotStats } from './modules/analytics/analytics.service.js';

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    // Build app
    const { app, io } = await buildApp();

    // Start stats collection interval (every 5 minutes)
    const statsInterval = setInterval(async () => {
      try {
        await recordBotStats();
      } catch (error) {
        logger.error({ error }, 'Failed to record bot stats');
      }
    }, 5 * 60 * 1000);

    // Start server using Fastify's listen
    await app.listen({ port: config.PORT, host: config.HOST });

    logger.info({ port: config.PORT, host: config.HOST }, 'Server started');
    logger.info(`API: http://${config.HOST}:${config.PORT}`);
    logger.info(`WebSocket: ws://${config.HOST}:${config.PORT}`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down...');

      clearInterval(statsInterval);

      await app.close();
      logger.info('Server closed');

      io.close(() => {
        logger.info('WebSocket server closed');
      });

      await disconnectDatabase();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
