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

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');

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
    duplicate_approval_reason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

export const updatePlatformTenantSubscriptionRequestSchema = z
  .object({
    plan_id: z.string().trim().uuid(),
    subscription_start_date: dateOnlySchema,
    subscription_expiration_date: dateOnlySchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type ListPlatformTenantsQuery = z.infer<typeof listPlatformTenantsQuerySchema>;

export type CreatePlatformTenantRequest = z.infer<typeof createPlatformTenantRequestSchema>;

export type UpdatePlatformTenantSubscriptionRequest = z.infer<
  typeof updatePlatformTenantSubscriptionRequestSchema
>;
