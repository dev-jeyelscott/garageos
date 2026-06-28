import { z } from 'zod';

const uuidSchema = z.string().uuid();

const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Money must use up to 2 decimal places.');

const quantitySchema = z
  .string()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, 'Quantity must use up to 3 decimal places.');

export const jobOrderStatusSchema = z.enum([
  'pending',
  'in_progress',
  'waiting_for_parts',
  'completed',
  'released',
  'cancelled',
]);

export const jobOrderServiceLaborLineTypeSchema = z.enum(['service', 'labor']);

const MAX_ADDITIONAL_MECHANICS = 50;

const jobOrderServiceLaborLineRequestSchema = z
  .object({
    line_type: jobOrderServiceLaborLineTypeSchema,
    service_id: uuidSchema.nullish(),
    description: z.string().trim().min(1).max(500),
    quantity: quantitySchema.default('1.000'),
    unit_price: moneySchema.default('0.00'),
    line_order: z.number().int().min(0).max(999).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.line_type === 'labor' &&
      value.service_id !== null &&
      value.service_id !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['service_id'],
        message: 'Labor lines must not reference a predefined service.',
      });
    }

    if (value.line_type === 'labor' && Number(value.quantity) * Number(value.unit_price) === 0) {
      context.addIssue({
        code: 'custom',
        path: ['unit_price'],
        message:
          'Zero-amount labor lines require a free-labor reason, which is not supported in this baseline slice.',
      });
    }
  });

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

export const createJobOrderServiceLineRequestSchema = jobOrderServiceLaborLineRequestSchema;

export const updateJobOrderLineRequestSchema = jobOrderServiceLaborLineRequestSchema;

export const createJobOrderPartLineRequestSchema = z.object({
  product_id: uuidSchema,
  description: z.string().trim().min(1).max(500),
  quantity: quantitySchema.default('1.000'),
  unit_price: moneySchema.default('0.00'),
});

export const assignJobOrderMechanicsRequestSchema = z
  .object({
    primary_mechanic_user_id: uuidSchema,
    additional_mechanic_user_ids: z.array(uuidSchema).max(MAX_ADDITIONAL_MECHANICS).default([]),
  })
  .superRefine((value, context) => {
    const uniqueAdditionalMechanicIds = new Set(value.additional_mechanic_user_ids);

    if (uniqueAdditionalMechanicIds.size !== value.additional_mechanic_user_ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['additional_mechanic_user_ids'],
        message: 'Additional mechanic assignments must not contain duplicate users.',
      });
    }

    if (uniqueAdditionalMechanicIds.has(value.primary_mechanic_user_id)) {
      context.addIssue({
        code: 'custom',
        path: ['additional_mechanic_user_ids'],
        message: 'Primary mechanic must not also be assigned as an additional mechanic.',
      });
    }
  });

export const transitionJobOrderStatusRequestSchema = z
  .object({
    to_status: jobOrderStatusSchema,
    reason: z.string().trim().min(1).max(1000).nullish(),
    lock_version: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (
      value.to_status === 'waiting_for_parts' &&
      (value.reason === null || value.reason === undefined || value.reason.trim().length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason is required when moving a job order to waiting for parts.',
      });
    }
  });

export type JobOrderStatusRequest = z.infer<typeof jobOrderStatusSchema>;
export type ListJobOrdersQuery = z.infer<typeof listJobOrdersQuerySchema>;
export type CreateJobOrderRequest = z.infer<typeof createJobOrderRequestSchema>;
export type UpdateJobOrderRequest = z.infer<typeof updateJobOrderRequestSchema>;
export type AssignJobOrderMechanicsRequest = z.infer<typeof assignJobOrderMechanicsRequestSchema>;
export type TransitionJobOrderStatusRequest = z.infer<typeof transitionJobOrderStatusRequestSchema>;
export type CreateJobOrderServiceLineRequest = z.infer<
  typeof createJobOrderServiceLineRequestSchema
>;
export type UpdateJobOrderLineRequest = z.infer<typeof updateJobOrderLineRequestSchema>;
export type CreateJobOrderPartLineRequest = z.infer<typeof createJobOrderPartLineRequestSchema>;
