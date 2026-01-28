import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  // Add security headers to all responses
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy, but still useful)
    reply.header('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (disable unnecessary browser features)
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );

    // Content Security Policy for API (strict)
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );

    // Strict Transport Security (HTTPS only in production)
    if (config.NODE_ENV === 'production') {
      reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // Remove server identification header
    reply.removeHeader('X-Powered-By');
  });

  // Request validation hooks
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Block requests with suspicious content types
    const contentType = request.headers['content-type'];
    if (contentType && !isValidContentType(contentType)) {
      return reply.status(415).send({
        success: false,
        error: 'Unsupported media type',
      });
    }

    // Validate content length (prevent oversized requests)
    const contentLength = parseInt(request.headers['content-length'] || '0', 10);
    const maxSize = 50 * 1024 * 1024; // 50MB max
    if (contentLength > maxSize) {
      return reply.status(413).send({
        success: false,
        error: 'Request entity too large',
      });
    }
  });
}

function isValidContentType(contentType: string): boolean {
  const validTypes = [
    'application/json',
    'multipart/form-data',
    'application/x-www-form-urlencoded',
    'text/plain',
  ];
  return validTypes.some((type) => contentType.toLowerCase().includes(type));
}

// Input sanitization utilities
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';

  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '');

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\0-\x1F\x7F]/g, '');

  // Limit length
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized;
}

export function isValidPath(path: string, basePath: string): boolean {
  const normalizedPath = require('path').resolve(basePath, path);
  return normalizedPath.startsWith(require('path').resolve(basePath));
}
