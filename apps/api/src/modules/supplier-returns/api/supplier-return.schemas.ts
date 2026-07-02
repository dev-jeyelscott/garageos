import { z } from 'zod';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidSchema = z.string().trim().regex(UUID_PATTERN, 'Value must be a valid UUID.');

const optionalUuidSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}, uuidSchema.optional());

const positiveQuantitySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toFixed(3);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'Quantity must be a positive decimal with up to 3 decimals.')
    .transform((value) => normalizeDecimalString(value, 3))
    .refine((value) => !isDecimalZero(value), {
      message: 'Quantity must be greater than zero.',
    }),
);

const reasonSchema = z.string().trim().min(1).max(500);

const supplierReturnLineRequestSchema = z
  .object({
    product_id: uuidSchema,
    returned_quantity: positiveQuantitySchema,
  })
  .strict();

const immediateCashRefundSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .strict();

export const listSupplierReturnsQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    supplier_id: uuidSchema.optional(),
    status: z.enum(['draft', 'posted', 'cancelled', 'all']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const supplierReturnIdParamsSchema = z
  .object({
    supplier_return_id: uuidSchema,
  })
  .strict();

export const createSupplierReturnRequestSchema = z
  .object({
    branch_id: uuidSchema,
    supplier_id: uuidSchema,
    original_receiving_id: optionalUuidSchema,
    reason: reasonSchema,
    immediate_cash_refund: immediateCashRefundSchema.optional(),
    lines: z.array(supplierReturnLineRequestSchema).min(1).max(100),
  })
  .strict();

export const updateSupplierReturnRequestSchema = createSupplierReturnRequestSchema;

export const cancelSupplierReturnRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListSupplierReturnsQuery = z.infer<typeof listSupplierReturnsQuerySchema>;
export type SupplierReturnIdParams = z.infer<typeof supplierReturnIdParamsSchema>;
export type CreateSupplierReturnRequest = z.infer<typeof createSupplierReturnRequestSchema>;
export type UpdateSupplierReturnRequest = z.infer<typeof updateSupplierReturnRequestSchema>;
export type CancelSupplierReturnRequest = z.infer<typeof cancelSupplierReturnRequestSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}

function isDecimalZero(value: string): boolean {
  return value
    .replace('.', '')
    .split('')
    .every((character) => character === '0');
}
