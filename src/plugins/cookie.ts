import cookie from '@fastify/cookie';
import { FastifyInstance } from 'fastify';

export async function registerCookie(app: FastifyInstance): Promise<void> {
  await app.register(cookie, {
    secret: process.env.JWT_SECRET,
    hook: 'onRequest',
  });
}
