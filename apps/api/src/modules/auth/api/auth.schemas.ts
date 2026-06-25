import { z } from 'zod';

export const garageOsPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.');

export const loginRequestSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1, 'Password is required.'),
    remember_me: z.boolean().optional(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
