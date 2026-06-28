import { z } from 'zod';

const MAX_MONEY = 999_999_999_999.99;
const MAX_QUANTITY = 999_999_999_999.999;

const optionalTextSchema = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    return value;
  }, z.string().trim().min(1).max(maxLength).optional());

const moneySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a non-negative decimal with up to 2 decimals.')
    .transform((value) => normalizeDecimalString(value, 2))
    .refine((value) => Number(value) <= MAX_MONEY, {
      message: 'Amount is too large.',
    }),
);

const quantitySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'Quantity must be a non-negative decimal with up to 3 decimals.')
    .transform((value) => normalizeDecimalString(value, 3))
    .refine((value) => Number(value) <= MAX_QUANTITY, {
      message: 'Quantity is too large.',
    }),
);

const productBaseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    sku: z.string().trim().min(1).max(80),
    barcode: optionalTextSchema(80),
    supplier_code: optionalTextSchema(80),
    brand: optionalTextSchema(100),
    category_id: z.string().uuid(),
    unit_of_measure: z.string().trim().min(1).max(50),
    default_cost: moneySchema,
    selling_price: moneySchema,
    reorder_level: quantitySchema,
    description: optionalTextSchema(1000),
  })
  .strict();

export const listProductsQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    category_id: z.string().uuid().optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createProductRequestSchema = productBaseRequestSchema;

export const updateProductRequestSchema = productBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const productStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
export type ProductStatusChangeRequest = z.infer<typeof productStatusChangeRequestSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart, decimalPart = ''] = value.split('.');

  return `${wholePart}.${decimalPart.padEnd(scale, '0')}`;
}
