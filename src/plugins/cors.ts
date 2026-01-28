import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    // In production, strictly validate origin
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      // In production, you might want to restrict this
      if (!origin) {
        callback(null, config.NODE_ENV !== 'production');
        return;
      }

      // Check against allowed origins
      const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (config.NODE_ENV !== 'production') {
        // In development, allow localhost
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours - browsers cache preflight response
  });
}
