import pino from 'pino';
import { config } from '../config/index.js';

// @ts-ignore - ESM/CJS interop
const pinoFn = typeof pino === 'function' ? pino : (pino as any).default;

export const logger = pinoFn({
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
