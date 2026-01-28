import { prisma } from '../../utils/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  parseExpiryToMs,
} from '../../utils/jwt.js';
import { config } from '../../config/index.js';
import { LoginInput, ChangePasswordInput } from './auth.schema.js';
import crypto from 'crypto';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  requiresPasswordChange: boolean;
  user: {
    id: string;
    username: string;
  };
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const admin = await prisma.admin.findUnique({
    where: { username: input.username },
  });

  if (!admin) {
    throw new Error('Invalid credentials');
  }

  const validPassword = await verifyPassword(input.password, admin.passwordHash);
  if (!validPassword) {
    throw new Error('Invalid credentials');
  }

  // Update last login
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const tokenPayload = { adminId: admin.id, username: admin.username };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Hash refresh token for storage
  const hashedRefreshToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Store refresh token (use upsert to handle edge cases)
  await prisma.refreshToken.upsert({
    where: { token: hashedRefreshToken },
    update: {
      expiresAt: new Date(Date.now() + parseExpiryToMs(config.JWT_REFRESH_EXPIRY)),
      revokedAt: null,
    },
    create: {
      token: hashedRefreshToken,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + parseExpiryToMs(config.JWT_REFRESH_EXPIRY)),
    },
  });

  return {
    accessToken,
    refreshToken,
    requiresPasswordChange: admin.mustChangePassword,
    user: {
      id: admin.id,
      username: admin.username,
    },
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  // Verify the token
  const decoded = verifyRefreshToken(refreshToken);

  // Hash to find in database
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Check if token exists and is valid
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: { admin: true },
  });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    throw new Error('Invalid refresh token');
  }

  // Revoke old token (rotation)
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  // Generate new tokens
  const tokenPayload = {
    adminId: storedToken.admin.id,
    username: storedToken.admin.username,
  };
  const newAccessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  // Hash and store new refresh token
  const hashedNewRefreshToken = crypto
    .createHash('sha256')
    .update(newRefreshToken)
    .digest('hex');

  // Use upsert to handle race conditions (e.g., React Strict Mode double-invoke)
  await prisma.refreshToken.upsert({
    where: { token: hashedNewRefreshToken },
    update: {
      expiresAt: new Date(Date.now() + parseExpiryToMs(config.JWT_REFRESH_EXPIRY)),
      revokedAt: null,
    },
    create: {
      token: hashedNewRefreshToken,
      adminId: storedToken.admin.id,
      expiresAt: new Date(Date.now() + parseExpiryToMs(config.JWT_REFRESH_EXPIRY)),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  await prisma.refreshToken.updateMany({
    where: { token: hashedToken },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  adminId: string,
  input: ChangePasswordInput
): Promise<void> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    throw new Error('User not found');
  }

  const validPassword = await verifyPassword(input.currentPassword, admin.passwordHash);
  if (!validPassword) {
    throw new Error('Current password is incorrect');
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.admin.update({
    where: { id: adminId },
    data: {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    },
  });

  // Revoke all refresh tokens to force re-login
  await prisma.refreshToken.updateMany({
    where: { adminId },
    data: { revokedAt: new Date() },
  });
}

export async function getAdminInfo(adminId: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      username: true,
      mustChangePassword: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  if (!admin) {
    throw new Error('User not found');
  }

  return admin;
}
