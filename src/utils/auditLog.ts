import { logger } from './logger.js';
import { prisma } from './database.js';
import { FastifyRequest } from 'fastify';
import { AuditAction } from '@prisma/client';

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  username?: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  success: boolean;
  timestamp: Date;
}

export async function auditLog(
  action: AuditAction,
  request: FastifyRequest | null,
  details: {
    userId?: string;
    username?: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    details?: Record<string, unknown>;
    success?: boolean;
  }
): Promise<void> {
  const entry: AuditLogEntry = {
    action,
    userId: details.userId,
    username: details.username,
    resourceType: details.resourceType,
    resourceId: details.resourceId,
    resourceName: details.resourceName,
    details: details.details,
    ip: request ? getClientIp(request) : undefined,
    userAgent: request?.headers['user-agent'],
    success: details.success ?? true,
    timestamp: new Date(),
  };

  // Log to console based on action type
  if (action.includes('FAILED') || action === 'SUSPICIOUS_ACTIVITY') {
    logger.warn({ audit: entry }, `AUDIT: ${action}`);
  } else {
    logger.info({ audit: entry }, `AUDIT: ${action}`);
  }

  // Save to database (don't await to avoid blocking)
  prisma.auditLog
    .create({
      data: {
        action,
        userId: entry.userId,
        username: entry.username,
        ip: entry.ip,
        userAgent: entry.userAgent,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        details: entry.details as any,
        success: entry.success,
      },
    })
    .catch((error) => {
      logger.error({ error }, 'Failed to save audit log to database');
    });
}

function getClientIp(request: FastifyRequest): string {
  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.ip || 'unknown';
}

// Detect suspicious patterns
export function detectSuspiciousActivity(request: FastifyRequest): boolean {
  const userAgent = request.headers['user-agent'] || '';
  const url = request.url;

  // Check for common attack patterns
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS attempt
    /union.*select/i, // SQL injection
    /eval\s*\(/i, // Code injection
    /etc\/passwd/i, // File access attempt
    /\$\{.*\}/i, // Template injection
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(JSON.stringify(request.body || {}))) {
      auditLog('SUSPICIOUS_ACTIVITY', request, {
        details: {
          pattern: pattern.toString(),
          url,
          body: request.body,
        },
        success: false,
      });
      return true;
    }
  }

  // Check for suspicious user agents
  const suspiciousAgents = ['sqlmap', 'nikto', 'nmap', 'masscan', 'gobuster'];
  for (const agent of suspiciousAgents) {
    if (userAgent.toLowerCase().includes(agent)) {
      auditLog('SUSPICIOUS_ACTIVITY', request, {
        details: {
          reason: 'Suspicious user agent',
          userAgent,
        },
        success: false,
      });
      return true;
    }
  }

  return false;
}

// Get audit logs with filtering
export async function getAuditLogs(options: {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  userId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
}) {
  const where: any = {};

  if (options.action) {
    where.action = options.action;
  }
  if (options.userId) {
    where.userId = options.userId;
  }
  if (options.success !== undefined) {
    where.success = options.success;
  }
  if (options.startDate || options.endDate) {
    where.timestamp = {};
    if (options.startDate) {
      where.timestamp.gte = options.startDate;
    }
    if (options.endDate) {
      where.timestamp.lte = options.endDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

// Get security stats
export async function getSecurityStats() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    failedLogins24h,
    failedLogins7d,
    suspiciousActivity24h,
    successfulLogins24h,
    totalLogs,
    activeSessionsCount,
    recentFailedLogins,
  ] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: 'LOGIN_FAILED',
        timestamp: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: 'LOGIN_FAILED',
        timestamp: { gte: last7d },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: 'SUSPICIOUS_ACTIVITY',
        timestamp: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: 'LOGIN_SUCCESS',
        timestamp: { gte: last24h },
      },
    }),
    prisma.auditLog.count(),
    prisma.refreshToken.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        action: 'LOGIN_FAILED',
        timestamp: { gte: last24h },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        ip: true,
        username: true,
        timestamp: true,
        userAgent: true,
      },
    }),
  ]);

  return {
    failedLogins: {
      last24h: failedLogins24h,
      last7d: failedLogins7d,
    },
    suspiciousActivity: {
      last24h: suspiciousActivity24h,
    },
    successfulLogins: {
      last24h: successfulLogins24h,
    },
    activeSessions: activeSessionsCount,
    totalAuditLogs: totalLogs,
    recentFailedLogins,
  };
}

// Get unique IPs with failed logins (potential attackers)
export async function getSuspiciousIPs(hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const result = await prisma.auditLog.groupBy({
    by: ['ip'],
    where: {
      action: 'LOGIN_FAILED',
      timestamp: { gte: since },
      ip: { not: null },
    },
    _count: { ip: true },
    orderBy: { _count: { ip: 'desc' } },
    take: 20,
  });

  return result.map((r) => ({
    ip: r.ip,
    attempts: r._count.ip,
  }));
}
