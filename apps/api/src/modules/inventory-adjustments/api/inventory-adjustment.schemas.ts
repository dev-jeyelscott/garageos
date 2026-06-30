import { z } from 'zod';

const MAX_MONEY = 999_999_999_999.99;
const MAX_QUANTITY = 999_999_999_999.999;

const signedQuantitySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,3})?$/, 'Quantity must be a decimal with up to 3 decimals.')
    .transform((value) => normalizeDecimalString(value, 3))
    .refine((value) => Math.abs(Number(value)) <= MAX_QUANTITY, {
      message: 'Quantity is too large.',
    }),
);

const nonNegativeQuantitySchema = z.preprocess(
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

const nonNegativeMoneySchema = z.preprocess(
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

const createInventoryAdjustmentLineSchema = z
  .object({
    product_id: z.string().uuid(),
    adjustment_type: z.enum([
      'positive_adjustment',
      'negative_adjustment',
      'final_counted_quantity',
    ]),
    quantity_difference: signedQuantitySchema.optional(),
    final_counted_quantity: nonNegativeQuantitySchema.optional(),
    unit_cost: nonNegativeMoneySchema.optional(),
  })
  .strict()
  .superRefine((line, context) => {
    const hasQuantityDifference = line.quantity_difference !== undefined;
    const hasFinalCountedQuantity = line.final_counted_quantity !== undefined;

    if (hasQuantityDifference === hasFinalCountedQuantity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity_difference'],
        message: 'Exactly one adjustment intent is required.',
      });
      return;
    }

    if (line.adjustment_type === 'final_counted_quantity' && !hasFinalCountedQuantity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['final_counted_quantity'],
        message: 'Final counted quantity is required for final counted quantity adjustments.',
      });
    }

    if (line.adjustment_type !== 'final_counted_quantity' && !hasQuantityDifference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity_difference'],
        message: 'Quantity difference is required for positive and negative adjustments.',
      });
    }

    if (line.adjustment_type === 'positive_adjustment' && Number(line.quantity_difference) <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity_difference'],
        message: 'Positive adjustments require a positive quantity difference.',
      });
    }

    if (line.adjustment_type === 'negative_adjustment' && Number(line.quantity_difference) >= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity_difference'],
        message: 'Negative adjustments require a negative quantity difference.',
      });
    }
  });

export const createInventoryAdjustmentRequestSchema = z
  .object({
    branch_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
    lines: z.array(createInventoryAdjustmentLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const productIds = new Set<string>();

    request.lines.forEach((line, index) => {
      if (productIds.has(line.product_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'product_id'],
          message: 'Duplicate product lines are not allowed.',
        });
      }

      productIds.add(line.product_id);
    });
  });

export type CreateInventoryAdjustmentRequest = z.infer<
  typeof createInventoryAdjustmentRequestSchema
>;

const forceInventoryAdjustmentLineSchema = z
  .object({
    product_id: z.string().uuid(),
    quantity_difference: signedQuantitySchema.optional(),
    final_counted_quantity: nonNegativeQuantitySchema.optional(),
    unit_cost: nonNegativeMoneySchema.optional(),
  })
  .strict()
  .superRefine((line, context) => {
    const hasQuantityDifference = line.quantity_difference !== undefined;
    const hasFinalCountedQuantity = line.final_counted_quantity !== undefined;

    if (hasQuantityDifference === hasFinalCountedQuantity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity_difference'],
        message: 'Exactly one force adjustment intent is required.',
      });
    }
  });

export const forceInventoryAdjustmentRequestSchema = z
  .object({
    branch_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
    lines: z.array(forceInventoryAdjustmentLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const productIds = new Set<string>();

    request.lines.forEach((line, index) => {
      if (productIds.has(line.product_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'product_id'],
          message: 'Duplicate product lines are not allowed.',
        });
      }

      productIds.add(line.product_id);
    });
  });

export type ForceInventoryAdjustmentRequest = z.infer<typeof forceInventoryAdjustmentRequestSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const isNegative = value.startsWith('-');
  const unsignedValue = isNegative ? value.slice(1) : value;
  const [wholePart = '0', decimalPart = ''] = unsignedValue.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');
  const normalizedValue = `${normalizedWholePart}.${normalizedDecimalPart}`;

  return isNegative && normalizedValue !== '0.'.padEnd(scale + 2, '0')
    ? `-${normalizedValue}`
    : normalizedValue;
}
