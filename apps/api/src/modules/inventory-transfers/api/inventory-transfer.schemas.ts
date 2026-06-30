import { z } from 'zod';

const MAX_QUANTITY = 999_999_999_999.999;

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

const createInventoryTransferLineSchema = z
  .object({
    product_id: z.string().uuid(),
    requested_quantity: positiveQuantitySchema,
  })
  .strict();

const sendInventoryTransferLineSchema = z
  .object({
    line_id: z.string().uuid(),
    sent_quantity: positiveQuantitySchema,
  })
  .strict();

const receiveInventoryTransferLineSchema = z
  .object({
    line_id: z.string().uuid(),
    received_quantity: nonNegativeQuantitySchema,
    variance_reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const createInventoryTransferRequestSchema = z
  .object({
    source_branch_id: z.string().uuid(),
    destination_branch_id: z.string().uuid(),
    remarks: z.string().trim().max(1000).optional(),
    lines: z.array(createInventoryTransferLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.source_branch_id === request.destination_branch_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destination_branch_id'],
        message: 'Destination branch must be different from source branch.',
      });
    }

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

export type CreateInventoryTransferRequest = z.infer<typeof createInventoryTransferRequestSchema>;

export const sendInventoryTransferRequestSchema = z
  .object({
    lines: z.array(sendInventoryTransferLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const lineIds = new Set<string>();

    request.lines.forEach((line, index) => {
      if (lineIds.has(line.line_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'line_id'],
          message: 'Duplicate transfer lines are not allowed.',
        });
      }

      lineIds.add(line.line_id);
    });
  });

export type SendInventoryTransferRequest = z.infer<typeof sendInventoryTransferRequestSchema>;

export const receiveInventoryTransferRequestSchema = z
  .object({
    lines: z.array(receiveInventoryTransferLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const lineIds = new Set<string>();

    request.lines.forEach((line, index) => {
      if (lineIds.has(line.line_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'line_id'],
          message: 'Duplicate transfer lines are not allowed.',
        });
      }

      lineIds.add(line.line_id);
    });
  });

export type ReceiveInventoryTransferRequest = z.infer<typeof receiveInventoryTransferRequestSchema>;

export const inventoryTransferIdParamsSchema = z
  .object({
    transfer_id: z.string().uuid(),
  })
  .strict();

export type InventoryTransferIdParams = z.infer<typeof inventoryTransferIdParamsSchema>;

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}
