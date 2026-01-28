import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { getAuditLogs, getSecurityStats, getSuspiciousIPs } from '../../utils/auditLog.js';
import { prisma } from '../../utils/database.js';
import { AuditAction } from '@prisma/client';

export async function securityRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // Get security dashboard stats
  app.get('/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await getSecurityStats();
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to get security stats',
      });
    }
  });

  // Get audit logs
  app.get(
    '/audit-logs',
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: string;
          offset?: string;
          action?: AuditAction;
          success?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { limit, offset, action, success } = request.query;

        const result = await getAuditLogs({
          limit: limit ? parseInt(limit, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0,
          action: action as AuditAction,
          success: success === 'true' ? true : success === 'false' ? false : undefined,
        });

        return reply.send({ success: true, data: result });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to get audit logs',
        });
      }
    }
  );

  // Get suspicious IPs
  app.get(
    '/suspicious-ips',
    async (
      request: FastifyRequest<{ Querystring: { hours?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const hours = request.query.hours ? parseInt(request.query.hours, 10) : 24;
        const ips = await getSuspiciousIPs(hours);
        return reply.send({ success: true, data: ips });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to get suspicious IPs',
        });
      }
    }
  );

  // Get active sessions
  app.get('/sessions', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await prisma.refreshToken.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          admin: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: sessions.map((s) => ({
          id: s.id,
          userId: s.admin.id,
          username: s.admin.username,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })),
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  });

  // Revoke a session
  app.delete(
    '/sessions/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        await prisma.refreshToken.update({
          where: { id: request.params.id },
          data: { revokedAt: new Date() },
        });

        return reply.send({ success: true, message: 'Session revoked' });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to revoke session',
        });
      }
    }
  );

  // Revoke all sessions (except current)
  app.post(
    '/sessions/revoke-all',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currentToken = request.cookies.refreshToken;

        // Revoke all tokens except the current one
        await prisma.refreshToken.updateMany({
          where: {
            revokedAt: null,
            token: { not: currentToken ? require('crypto').createHash('sha256').update(currentToken).digest('hex') : '' },
          },
          data: { revokedAt: new Date() },
        });

        return reply.send({ success: true, message: 'All other sessions revoked' });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to revoke sessions',
        });
      }
    }
  );

  // Clear old audit logs (keep last 30 days)
  app.post('/audit-logs/cleanup', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await prisma.auditLog.deleteMany({
        where: {
          timestamp: { lt: thirtyDaysAgo },
        },
      });

      return reply.send({
        success: true,
        message: `Deleted ${result.count} old audit log entries`,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to cleanup audit logs',
      });
    }
  });
}
