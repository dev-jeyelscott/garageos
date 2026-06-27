import { z } from 'zod';

const businessHoursSchema = z.record(z.string(), z.unknown());

export const createBranchRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    address: z.string().trim().min(1).max(500),
    contact_number: z.string().trim().min(1).max(50),
    business_hours: businessHoursSchema,
  })
  .strict();

export const updateBranchRequestSchema = createBranchRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const branchStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;
export type BranchStatusChangeRequest = z.infer<typeof branchStatusChangeRequestSchema>;
