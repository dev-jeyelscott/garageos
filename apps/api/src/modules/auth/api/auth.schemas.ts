import { z } from 'zod';

export const garageOsPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.');

export const authTokenSchema = z.string().trim().min(1, 'Token is required.');

export const loginRequestSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1, 'Password is required.'),
    remember_me: z.boolean().optional(),
  })
  .strict();

export const ownerSignupRequestSchema = z
  .object({
    business_name: z.string().trim().min(1).max(200),
    shop_email: z.string().trim().email(),
    owner: z
      .object({
        full_name: z.string().trim().min(1).max(200),
        email: z.string().trim().email(),
        password: garageOsPasswordSchema,
      })
      .strict(),
    timezone: z.string().trim().min(1).max(100).optional(),
    country: z.string().trim().length(2).optional(),
    currency: z.string().trim().length(3).optional(),
  })
  .strict();

export const emailVerificationConfirmRequestSchema = z
  .object({
    token: authTokenSchema,
  })
  .strict();

export const forgotPasswordRequestSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export const resetPasswordRequestSchema = z
  .object({
    token: authTokenSchema,
    new_password: garageOsPasswordSchema,
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    current_password: z.string().trim().min(1, 'Current password is required.'),
    new_password: garageOsPasswordSchema,
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type OwnerSignupRequest = z.infer<typeof ownerSignupRequestSchema>;

export type EmailVerificationConfirmRequest = z.infer<typeof emailVerificationConfirmRequestSchema>;

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
