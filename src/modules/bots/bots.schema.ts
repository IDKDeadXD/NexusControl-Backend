import { z } from 'zod';

export const createBotSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  runtime: z.enum(['NODEJS', 'PYTHON']).default('NODEJS'),
  entryFile: z.string().default('index.js'),
  startCommand: z.string().optional(),
  autoRestart: z.boolean().default(false),
  // Resource limits
  memoryLimit: z.number().min(64).max(8192).default(512), // MB
  cpuLimit: z.number().min(0.1).max(8).default(1.0), // CPU cores
});

export const updateBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  runtime: z.enum(['NODEJS', 'PYTHON']).optional(),
  entryFile: z.string().optional(),
  startCommand: z.string().optional().nullable(),
  autoRestart: z.boolean().optional(),
  memoryLimit: z.number().min(64).max(8192).optional(),
  cpuLimit: z.number().min(0.1).max(8).optional(),
});

export const envVarSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'Key must be uppercase with underscores only'),
  value: z.string(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;
export type EnvVarInput = z.infer<typeof envVarSchema>;
