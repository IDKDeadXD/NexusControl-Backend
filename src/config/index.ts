import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().min(64),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  BOT_CODE_PATH: z.string().default('./bots'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

export type Config = typeof config;
