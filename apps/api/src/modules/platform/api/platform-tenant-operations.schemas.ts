import { z } from 'zod';

export const supportAccessModeSchema = z.enum(['read_only', 'write_allowed']);

export const createSupportAccessSessionRequestSchema = z
  .object({
    access_mode: supportAccessModeSchema.default('read_only'),
    reason: z.string().trim().min(1).max(500),
    expires_at: z.string().datetime(),
  })
  .strict();

export const endSupportAccessSessionRequestSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const tenantStatusOverrideRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export const tenantExportPlaceholderRequestSchema = z
  .object({
    include_attachments: z.boolean().default(true),
    include_soft_deleted: z.boolean().default(false),
    metadata_only: z.boolean().default(false),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const tenantDeletionJobRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type CreateSupportAccessSessionRequest = z.infer<
  typeof createSupportAccessSessionRequestSchema
>;
export type EndSupportAccessSessionRequest = z.infer<typeof endSupportAccessSessionRequestSchema>;
export type TenantStatusOverrideRequest = z.infer<typeof tenantStatusOverrideRequestSchema>;
export type TenantExportPlaceholderRequest = z.infer<typeof tenantExportPlaceholderRequestSchema>;
export type TenantDeletionJobRequest = z.infer<typeof tenantDeletionJobRequestSchema>;
