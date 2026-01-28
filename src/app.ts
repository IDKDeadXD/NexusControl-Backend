import Fastify, { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { registerCors } from './plugins/cors.js';
import { registerCookie } from './plugins/cookie.js';
import { registerMultipart } from './plugins/multipart.js';
import { registerRateLimit } from './plugins/rateLimit.js';
import { registerSecurity } from './plugins/security.js';
import { detectSuspiciousActivity } from './utils/auditLog.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { botsRoutes } from './modules/bots/bots.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { webhookRoutes } from './modules/webhooks/webhook.routes.js';
import { securityRoutes } from './modules/security/security.routes.js';
import { setupWebSocket } from './modules/logs/logs.gateway.js';

export async function buildApp(): Promise<{ app: FastifyInstance; io: Server }> {
  const app = Fastify({
    logger: false,
    // Disable request body logging in production for security
    disableRequestLogging: config.NODE_ENV === 'production',
    // Trust proxy for proper IP detection behind reverse proxy
    trustProxy: true,
  });

  // Register plugins
  await registerCors(app);
  await registerCookie(app);
  await registerMultipart(app);
  await registerRateLimit(app);
  await registerSecurity(app);

  // Suspicious activity detection hook
  app.addHook('preHandler', async (request, reply) => {
    if (detectSuspiciousActivity(request)) {
      return reply.status(403).send({
        success: false,
        error: 'Request blocked',
      });
    }
  });

  // Request logging (for debugging/audit)
  if (config.NODE_ENV !== 'production') {
    app.addHook('onRequest', async (request) => {
      logger.debug({
        method: request.method,
        url: request.url,
        ip: request.ip,
      }, 'Incoming request');
    });
  }

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check (no auth required)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  }));

  // Register routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(botsRoutes, { prefix: '/api/bots' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(filesRoutes, { prefix: '/api/files' });
  await app.register(webhookRoutes, { prefix: '/api/webhooks' });
  await app.register(securityRoutes, { prefix: '/api/security' });

  // Ready the app
  await app.ready();

  // Setup Socket.io on Fastify's server
  const io = new Server(app.server, {
    cors: {
      origin: config.CORS_ORIGIN,
      credentials: true,
    },
  });

  setupWebSocket(io);

  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Application initialized');

  return { app, io };
}
