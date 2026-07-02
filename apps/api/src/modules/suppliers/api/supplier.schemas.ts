import { z } from 'zod';

const MAX_MONEY = 999_999_999_999.99;

const optionalTextSchema = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    return value;
  }, z.string().trim().min(1).max(maxLength).optional());

const positiveMoneySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toFixed(2);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal with up to 2 decimals.')
    .transform((value) => normalizeDecimalString(value, 2))
    .refine((value) => Number(value) > 0, {
      message: 'Amount must be greater than zero.',
    })
    .refine((value) => Number(value) <= MAX_MONEY, {
      message: 'Amount is too large.',
    }),
);

const paymentMethodSchema = z.enum([
  'cash',
  'gcash',
  'maya',
  'bank_transfer',
  'credit_card',
  'check',
  'other',
]);

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must use YYYY-MM-DD format.')
  .refine(isValidDateOnly, {
    message: 'Payment date must be a valid calendar date.',
  });

const supplierBaseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    contact_person: optionalTextSchema(150),
    mobile_number: optionalTextSchema(50),
    email: optionalTextSchema(254),
    address: optionalTextSchema(500),
    notes: optionalTextSchema(1000),
  })
  .strict();

export const listSuppliersQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const createSupplierRequestSchema = supplierBaseRequestSchema;

export const updateSupplierRequestSchema = supplierBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const supplierStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const supplierPaymentRequestSchema = z
  .object({
    amount: positiveMoneySchema,
    payment_date: businessDateSchema,
    payment_method: paymentMethodSchema,
    reference_number: optionalTextSchema(120),
    notes: optionalTextSchema(1000),
  })
  .strict();

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;
export type SupplierStatusChangeRequest = z.infer<typeof supplierStatusChangeRequestSchema>;
export type SupplierPaymentRequest = z.infer<typeof supplierPaymentRequestSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}

function isValidDateOnly(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
