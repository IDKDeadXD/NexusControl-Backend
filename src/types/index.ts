import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    adminId: string;
    username: string;
  };
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<void>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
