import { z } from 'zod';

const uuidSchema = z.string().uuid();

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.');

const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Money must use up to 2 decimal places.');

const quantitySchema = z
  .string()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, 'Quantity must use up to 3 decimal places.');

const estimateBaselineLineTypeSchema = z.enum(['service', 'labor']);

export const estimateApprovalMethodSchema = z.enum([
  'verbal',
  'sms',
  'email',
  'signed_document',
  'other',
]);

export const estimateLineRequestSchema = z
  .object({
    line_type: estimateBaselineLineTypeSchema,
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
        message: 'Labor lines must not reference a service.',
      });
    }
  });

export const listEstimatesQuerySchema = z.object({
  branch_id: uuidSchema,
  status: z
    .enum(['draft', 'presented', 'approved', 'converted', 'cancelled', 'expired'])
    .optional(),
  customer_id: uuidSchema.optional(),
  motorcycle_id: uuidSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createEstimateRequestSchema = z.object({
  branch_id: uuidSchema,
  customer_id: uuidSchema,
  motorcycle_id: uuidSchema.nullish(),
  valid_until_date: dateOnlySchema.nullish(),
  lines: z.array(estimateLineRequestSchema).min(1).max(100),
});

export const updateEstimateRequestSchema = z.object({
  valid_until_date: dateOnlySchema.nullish(),
  lines: z.array(estimateLineRequestSchema).min(1).max(100),
  lock_version: z.number().int().min(0),
});

export const presentEstimateRequestSchema = z.object({
  lock_version: z.number().int().min(0),
});

export const approveEstimateRequestSchema = z.object({
  approval_method: estimateApprovalMethodSchema,
  approved_by_customer_name: z.string().trim().min(1).max(150),
  lock_version: z.number().int().min(0),
});

export type ListEstimatesQuery = z.infer<typeof listEstimatesQuerySchema>;
export type CreateEstimateRequest = z.infer<typeof createEstimateRequestSchema>;
export type UpdateEstimateRequest = z.infer<typeof updateEstimateRequestSchema>;
export type PresentEstimateRequest = z.infer<typeof presentEstimateRequestSchema>;
export type ApproveEstimateRequest = z.infer<typeof approveEstimateRequestSchema>;
export type EstimateLineRequest = z.infer<typeof estimateLineRequestSchema>;
export type EstimateApprovalMethodRequest = z.infer<typeof estimateApprovalMethodSchema>;
