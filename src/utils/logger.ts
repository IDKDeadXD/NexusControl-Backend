import pino from 'pino';
const pinoLogger = (pino as unknown as typeof pino.default).default || pino;
import { config } from '../config/index.js';

export const logger = pinoLogger({
  level: config.NODE_ENV === 'development' ? 'debug' : 'info',
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
