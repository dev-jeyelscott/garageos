import { z } from 'zod';

export const platformTenantStatusSchema = z.enum([
  'pending_setup',
  'active',
  'grace_period',
  'read_only',
  'suspended',
  'pending_deletion',
  'deleted',
]);

export const platformSupportAccessModeSchema = z.enum(['read_only', 'write_allowed']);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');

const optionalTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Timestamp must be a valid date-time value.',
  });

const ownerInvitationRequestSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email(),
    send_invitation: z.literal(true),
  })
  .strict();

export const listPlatformTenantsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).optional(),
    status: platformTenantStatusSchema.optional(),
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const createPlatformTenantRequestSchema = z
  .object({
    business_name: z.string().trim().min(1).max(200),
    shop_email: z.string().trim().email(),
    plan_id: z.string().trim().uuid(),
    subscription_start_date: dateOnlySchema,
    subscription_expiration_date: dateOnlySchema,
    owner: ownerInvitationRequestSchema,
    approve_duplicate: z.boolean().optional(),
    duplicate_approval_reason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const duplicateApprovalReason =
      typeof value.duplicate_approval_reason === 'string'
        ? value.duplicate_approval_reason.trim()
        : '';

    if (value.approve_duplicate === true && duplicateApprovalReason.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['duplicate_approval_reason'],
        message: 'Duplicate approval reason is required when approving a duplicate tenant.',
      });
    }

    if (value.approve_duplicate !== true && duplicateApprovalReason.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approve_duplicate'],
        message: 'approve_duplicate must be true when duplicate_approval_reason is provided.',
      });
    }
  });

export const updatePlatformTenantSubscriptionRequestSchema = z
  .object({
    plan_id: z.string().trim().uuid(),
    subscription_start_date: dateOnlySchema,
    subscription_expiration_date: dateOnlySchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const applyPlatformTenantReadOnlyOverrideRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    expires_at: optionalTimestampSchema.optional(),
  })
  .strict();

export const applyPlatformTenantSuspensionRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    expires_at: optionalTimestampSchema.optional(),
  })
  .strict();

export const queuePlatformTenantExportRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    include_attachments: z.boolean().optional(),
  })
  .strict();

export const queuePlatformTenantDeletionJobRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const startPlatformSupportAccessSessionRequestSchema = z
  .object({
    mode: platformSupportAccessModeSchema,
    reason: z.string().trim().min(1).max(500),
    expires_at: optionalTimestampSchema,
  })
  .strict();

export const endPlatformSupportAccessSessionRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type ListPlatformTenantsQuery = z.infer<typeof listPlatformTenantsQuerySchema>;

export type CreatePlatformTenantRequest = z.infer<typeof createPlatformTenantRequestSchema>;

export type UpdatePlatformTenantSubscriptionRequest = z.infer<
  typeof updatePlatformTenantSubscriptionRequestSchema
>;

export type ApplyPlatformTenantReadOnlyOverrideRequest = z.infer<
  typeof applyPlatformTenantReadOnlyOverrideRequestSchema
>;

export type ApplyPlatformTenantSuspensionRequest = z.infer<
  typeof applyPlatformTenantSuspensionRequestSchema
>;

export type QueuePlatformTenantExportRequest = z.infer<
  typeof queuePlatformTenantExportRequestSchema
>;

export type QueuePlatformTenantDeletionJobRequest = z.infer<
  typeof queuePlatformTenantDeletionJobRequestSchema
>;

export type PlatformSupportAccessMode = z.infer<typeof platformSupportAccessModeSchema>;

export type StartPlatformSupportAccessSessionRequest = z.infer<
  typeof startPlatformSupportAccessSessionRequestSchema
>;

export type EndPlatformSupportAccessSessionRequest = z.infer<
  typeof endPlatformSupportAccessSessionRequestSchema
>;
