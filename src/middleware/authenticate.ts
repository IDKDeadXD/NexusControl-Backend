import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../utils/database.js';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    // Verify admin still exists
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, username: true },
    });

    if (!admin) {
      return reply.status(401).send({
        success: false,
        error: 'User not found',
      });
    }

    // Attach user to request
    (request as any).user = {
      adminId: admin.id,
      username: admin.username,
    };
  } catch (error) {
    return reply.status(401).send({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}
