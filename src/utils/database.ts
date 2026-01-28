import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

prisma.$on('error' as never, (e: unknown) => {
  logger.error(e, 'Prisma error');
});

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn(e, 'Prisma warning');
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to database');
  } catch (error) {
    logger.error(error, 'Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from database');
}
