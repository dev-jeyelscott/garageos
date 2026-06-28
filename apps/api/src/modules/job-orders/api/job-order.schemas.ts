import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const jobOrderStatusSchema = z.enum([
  'pending',
  'in_progress',
  'waiting_for_parts',
  'completed',
  'released',
  'cancelled',
]);

export const listJobOrdersQuerySchema = z.object({
  branch_id: uuidSchema,
  status: jobOrderStatusSchema.optional(),
  customer_id: uuidSchema.optional(),
  motorcycle_id: uuidSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createJobOrderRequestSchema = z.object({
  branch_id: uuidSchema,
  customer_id: uuidSchema,
  motorcycle_id: uuidSchema,
  mileage_at_intake: z.number().int().min(0),
  customer_concern: z.string().trim().min(1).max(1000),
  internal_notes: z.string().trim().max(2000).nullish(),
});

export const updateJobOrderRequestSchema = z
  .object({
    mileage_at_intake: z.number().int().min(0).optional(),
    customer_concern: z.string().trim().min(1).max(1000).optional(),
    internal_notes: z.string().trim().max(2000).nullish(),
    lock_version: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    const hasEditableField =
      value.mileage_at_intake !== undefined ||
      value.customer_concern !== undefined ||
      Object.prototype.hasOwnProperty.call(value, 'internal_notes');

    if (!hasEditableField) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one editable job order field is required.',
      });
    }
  });

export type JobOrderStatusRequest = z.infer<typeof jobOrderStatusSchema>;
export type ListJobOrdersQuery = z.infer<typeof listJobOrdersQuerySchema>;
export type CreateJobOrderRequest = z.infer<typeof createJobOrderRequestSchema>;
export type UpdateJobOrderRequest = z.infer<typeof updateJobOrderRequestSchema>;
