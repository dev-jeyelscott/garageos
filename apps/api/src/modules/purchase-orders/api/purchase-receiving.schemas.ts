import { z } from 'zod';

const MAX_QUANTITY = 999_999_999_999.999;
const MAX_MONEY = 999_999_999_999.99;

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

const purchaseReceivingLineSchema = z
  .object({
    purchase_order_line_id: z.string().uuid(),
    received_quantity: positiveQuantitySchema,
    received_unit_cost: nonNegativeMoneySchema,
  })
  .strict();

export const receivePurchaseOrderRequestSchema = z
  .object({
    received_at: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    payment_method: z
      .enum(['cash', 'gcash', 'maya', 'bank_transfer', 'credit_card', 'check', 'other'])
      .optional(),
    payment_reference: z.string().trim().min(1).max(120).optional(),
    lines: z.array(purchaseReceivingLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const lineIds = new Set<string>();

    request.lines.forEach((line, index) => {
      if (lineIds.has(line.purchase_order_line_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'purchase_order_line_id'],
          message: 'Duplicate purchase order lines are not allowed.',
        });
      }

      lineIds.add(line.purchase_order_line_id);
    });
  });

export type ReceivePurchaseOrderRequest = z.infer<typeof receivePurchaseOrderRequestSchema>;

export const purchaseOrderIdParamsSchema = z
  .object({
    purchase_order_id: z.string().uuid(),
  })
  .strict();

export type PurchaseOrderIdParams = z.infer<typeof purchaseOrderIdParamsSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}
