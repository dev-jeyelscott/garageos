import { z } from 'zod';

const MAX_QUANTITY = 999_999_999_999.999;
const MAX_MONEY = 999_999_999_999.99;

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.');

const optionalBusinessDateSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}, businessDateSchema.optional());

const optionalTextSchema = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    return value;
  }, z.string().trim().min(1).max(maxLength).optional());

const positiveQuantitySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'Quantity must be a positive decimal with up to 3 decimals.')
    .transform((value) => normalizeDecimalString(value, 3))
    .refine((value) => Number(value) > 0, {
      message: 'Quantity must be greater than zero.',
    })
    .refine((value) => Number(value) <= MAX_QUANTITY, {
      message: 'Quantity is too large.',
    }),
);

const nonNegativeMoneySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toFixed(2);
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

const purchaseOrderDraftLineSchema = z
  .object({
    product_id: z.string().uuid(),
    ordered_quantity: positiveQuantitySchema,
    unit_cost: nonNegativeMoneySchema,
    notes: optionalTextSchema(500),
  })
  .strict();

const purchaseOrderDraftRequestBaseSchema = z
  .object({
    branch_id: z.string().uuid(),
    supplier_id: z.string().uuid(),
    payment_terms: z.enum(['cash', 'credit']),
    order_date: businessDateSchema,
    expected_receive_date: optionalBusinessDateSchema,
    lines: z.array(purchaseOrderDraftLineSchema).min(1).max(100),
  })
  .strict();

export const createPurchaseOrderRequestSchema = purchaseOrderDraftRequestBaseSchema.superRefine(
  validatePurchaseOrderDraftRequest,
);

export const updatePurchaseOrderRequestSchema = purchaseOrderDraftRequestBaseSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict()
  .superRefine(validatePurchaseOrderDraftRequest);

export const purchaseOrderIdParamsSchema = z
  .object({
    purchase_order_id: z.string().uuid(),
  })
  .strict();

export type CreatePurchaseOrderRequest = z.infer<typeof createPurchaseOrderRequestSchema>;
export type UpdatePurchaseOrderRequest = z.infer<typeof updatePurchaseOrderRequestSchema>;
export type PurchaseOrderIdParams = z.infer<typeof purchaseOrderIdParamsSchema>;

function validatePurchaseOrderDraftRequest(
  request: {
    readonly order_date: string;
    readonly expected_receive_date?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    request.expected_receive_date !== undefined &&
    request.expected_receive_date < request.order_date
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expected_receive_date'],
      message: 'Expected receive date cannot be before the order date.',
    });
  }
}

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}
