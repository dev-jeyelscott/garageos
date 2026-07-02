import { z } from 'zod';

const businessDateQuerySchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.')
    .optional(),
);

const optionalSearchTextSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).max(100).optional());

const optionalCursorSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).optional());

const optionalUuidSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value;
}, z.string().trim().uuid().optional());

export const purchaseOrderListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: optionalCursorSchema,
    q: optionalSearchTextSchema,
    status: z
      .enum(['all', 'draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled'])
      .default('all'),
    branch_id: optionalUuidSchema,
    from_date: businessDateQuerySchema,
    to_date: businessDateQuerySchema,
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from_date !== undefined &&
      query.to_date !== undefined &&
      query.to_date < query.from_date
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to_date'],
        message: 'To date cannot be before from date.',
      });
    }
  });

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
