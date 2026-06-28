import { z } from 'zod';

const inventoryTransactionTypes = [
  'purchase_receive',
  'job_order_reservation',
  'reservation_release',
  'job_order_consumption',
  'inventory_adjustment_increase',
  'inventory_adjustment_decrease',
  'inventory_transfer_reservation',
  'inventory_transfer_reservation_release',
  'inventory_transfer_out',
  'inventory_transfer_in',
  'inventory_transfer_variance_loss',
  'supplier_return',
  'refund_inventory_reversal',
  'void_inventory_reversal',
] as const;

const optionalUuidSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().uuid().optional());

const optionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const optionalSourceTypeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    return normalized.length > 0 ? normalized : undefined;
  },
  z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,79}$/)
    .optional(),
);

const optionalDateTimeSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value;
}, z.coerce.date().optional());

export const productInventoryStockQuerySchema = z
  .object({
    branch_id: optionalUuidSchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const productFifoLayersQuerySchema = z
  .object({
    branch_id: optionalUuidSchema,
    open_only: optionalBooleanQuerySchema.default(false),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const listInventoryLedgerQuerySchema = z
  .object({
    branch_id: optionalUuidSchema,
    product_id: optionalUuidSchema,
    transaction_type: z.enum(inventoryTransactionTypes).optional(),
    source_type: optionalSourceTypeSchema,
    source_id: optionalUuidSchema,
    from_occurred_at: optionalDateTimeSchema,
    to_occurred_at: optionalDateTimeSchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from_occurred_at !== undefined &&
      query.to_occurred_at !== undefined &&
      query.from_occurred_at > query.to_occurred_at
    ) {
      context.addIssue({
        code: 'custom',
        path: ['from_occurred_at'],
        message: 'from_occurred_at must be before or equal to to_occurred_at.',
      });
    }
  });

export type ProductInventoryStockQuery = z.infer<typeof productInventoryStockQuerySchema>;
export type ProductFifoLayersQuery = z.infer<typeof productFifoLayersQuerySchema>;
export type ListInventoryLedgerQuery = z.infer<typeof listInventoryLedgerQuerySchema>;
