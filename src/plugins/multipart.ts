import multipart from '@fastify/multipart';
import { FastifyInstance } from 'fastify';

export async function registerMultipart(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 1, // Only 1 file at a time
    },
  });
}
