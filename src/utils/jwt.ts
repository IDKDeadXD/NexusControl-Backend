import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface TokenPayload {
  adminId: string;
  username: string;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): DecodedToken {
  return jwt.verify(token, config.JWT_SECRET) as DecodedToken;
}

export function verifyRefreshToken(token: string): DecodedToken {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as DecodedToken;
}

export function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}
