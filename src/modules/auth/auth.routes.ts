import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema, changePasswordSchema } from './auth.schema.js';
import * as authService from './auth.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authRateLimitConfig } from '../../plugins/rateLimit.js';
import { config } from '../../config/index.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { auditLog } from '../../utils/auditLog.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login
  app.post(
    '/login',
    {
      config: {
        rateLimit: authRateLimitConfig,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = loginSchema.parse(request.body);
        const result = await authService.login(body);

        // Audit log successful login
        auditLog('LOGIN_SUCCESS', request, {
          userId: result.user.id,
          username: result.user.username,
        });

        // Set refresh token as HttpOnly cookie
        reply.setCookie('refreshToken', result.refreshToken, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });

        return reply.send({
          success: true,
          data: {
            accessToken: result.accessToken,
            requiresPasswordChange: result.requiresPasswordChange,
            user: result.user,
          },
        });
      } catch (error) {
        // Audit log failed login
        const body = request.body as { username?: string } | undefined;
        auditLog('LOGIN_FAILED', request, {
          username: body?.username,
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          success: false,
        });

        return reply.status(401).send({
          success: false,
          error: 'Invalid credentials',
        });
      }
    }
  );

  // Refresh token
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          success: false,
          error: 'No refresh token provided',
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      // Update refresh token cookie
      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid refresh token',
      });
    }
  });

  // Logout
  app.post(
    '/logout',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const refreshToken = request.cookies.refreshToken;
        const user = (request as AuthenticatedRequest).user;

        if (refreshToken) {
          await authService.logout(refreshToken);
        }

        // Audit log logout
        auditLog('LOGOUT', request, {
          userId: user.adminId,
          username: user.username,
        });

        reply.clearCookie('refreshToken', {
          path: '/',
        });

        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'Logout failed',
        });
      }
    }
  );

  // Change password
  app.post(
    '/change-password',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = changePasswordSchema.parse(request.body);
        const user = (request as AuthenticatedRequest).user;

        await authService.changePassword(user.adminId, body);

        // Audit log password change
        auditLog('PASSWORD_CHANGED', request, {
          userId: user.adminId,
          username: user.username,
        });

        // Clear refresh token cookie since all tokens are revoked
        reply.clearCookie('refreshToken', {
          path: '/',
        });

        return reply.send({
          success: true,
          message: 'Password changed successfully. Please log in again.',
        });
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Password change failed',
        });
      }
    }
  );

  // Get current user info
  app.get(
    '/me',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as AuthenticatedRequest).user;
        const adminInfo = await authService.getAdminInfo(user.adminId);

        return reply.send({
          success: true,
          data: adminInfo,
        });
      } catch (error) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }
    }
  );
}
