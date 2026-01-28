import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: config.NODE_ENV === 'production' ? 100 : 1000, // requests per window
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests. Please slow down.',
    }),
    // Skip rate limiting for health checks
    allowList: (req) => req.url === '/health',
  });
}

// Strict rate limiting for auth endpoints
export const authRateLimitConfig = {
  max: 5,
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({
    success: false,
    error: 'Too many login attempts. Please try again later.',
  }),
};

// Rate limit for sensitive operations (bot control)
export const sensitiveRateLimitConfig = {
  max: 10,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    success: false,
    error: 'Too many requests. Please wait before trying again.',
  }),
};

// Rate limit for webhook testing
export const webhookTestRateLimitConfig = {
  max: 3,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    success: false,
    error: 'Too many test requests. Please wait before testing again.',
  }),
};
