import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error(
    {
      err: error,
      url: request.url,
      method: request.method,
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      success: false,
      error: 'Validation error',
      details: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle Fastify validation errors
  if (error.validation) {
    reply.status(400).send({
      success: false,
      error: 'Validation error',
      details: error.validation,
    });
    return;
  }

  // Handle known HTTP errors
  if (error.statusCode) {
    reply.status(error.statusCode).send({
      success: false,
      error: error.message,
    });
    return;
  }

  // Handle unknown errors
  reply.status(500).send({
    success: false,
    error: 'Internal server error',
  });
}
