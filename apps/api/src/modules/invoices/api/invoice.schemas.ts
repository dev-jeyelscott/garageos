import { z } from 'zod';

import { INVOICE_STATUS_VALUES, PAYMENT_METHOD_VALUES } from '../application/invoice.records';

const uuidSchema = z.string().uuid();
const moneyAmountSchema = z.string().regex(/^\d+(\.\d{2})$/, {
  message: 'Money amount must use exactly 2 decimal places.',
});
const percentageSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, {
    message: 'Percentage must use up to 4 decimal places.',
  })
  .refine((value) => Number(value) > 0 && Number(value) <= 100, {
    message: 'Percentage discount must be greater than 0 and less than or equal to 100.',
  });

const discountReasonSchema = z
  .string()
  .trim()
  .min(1, { message: 'Discount reason is required when a discount is applied.' })
  .max(255);

const workflowReasonSchema = z
  .string()
  .trim()
  .min(1, { message: 'A reason is required for this invoice workflow action.' })
  .max(500);

const invoiceLevelDiscountSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fixed'),
    amount: moneyAmountSchema.refine((value) => Number(value) > 0, {
      message: 'Fixed invoice discount amount must be greater than zero.',
    }),
    reason: discountReasonSchema,
  }),
  z.object({
    type: z.literal('percentage'),
    percentage: percentageSchema,
    reason: discountReasonSchema,
  }),
]);

export const listInvoicesQuerySchema = z.object({
  branch_id: uuidSchema.optional(),
  status: z.enum(INVOICE_STATUS_VALUES).optional(),
  customer_id: uuidSchema.optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createDraftInvoiceRequestSchema = z
  .object({
    job_order_ids: z.array(uuidSchema).min(1).max(25),
    job_order_line_ids: z.array(uuidSchema).min(1).max(250).optional(),
    invoice_date: z.coerce.date().optional(),
    due_date: z.coerce.date().optional().nullable(),
    invoice_level_discount: invoiceLevelDiscountSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.invoice_date !== undefined &&
      value.due_date !== undefined &&
      value.due_date !== null &&
      value.due_date < value.invoice_date
    ) {
      context.addIssue({
        code: 'custom',
        path: ['due_date'],
        message: 'Invoice due date must be on or after the invoice date.',
      });
    }

    if (new Set(value.job_order_ids).size !== value.job_order_ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['job_order_ids'],
        message: 'Job order IDs must not contain duplicates.',
      });
    }

    if (
      value.job_order_line_ids !== undefined &&
      new Set(value.job_order_line_ids).size !== value.job_order_line_ids.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['job_order_line_ids'],
        message: 'Job order line IDs must not contain duplicates.',
      });
    }
  });

export const issueInvoiceRequestSchema = z.object({}).default({});

export const cancelInvoiceRequestSchema = z.object({
  reason: workflowReasonSchema,
});

export const voidInvoiceRequestSchema = z.object({
  reason: workflowReasonSchema,
});

export const createInvoicePaymentRequestSchema = z.object({
  amount: moneyAmountSchema.refine((value) => Number(value) > 0, {
    message: 'Payment amount must be greater than zero.',
  }),
  payment_date: z.coerce.date(),
  payment_method: z.enum(PAYMENT_METHOD_VALUES),
  reference_number: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CreateDraftInvoiceRequest = z.infer<typeof createDraftInvoiceRequestSchema>;
export type IssueInvoiceRequest = z.infer<typeof issueInvoiceRequestSchema>;
export type CancelInvoiceRequest = z.infer<typeof cancelInvoiceRequestSchema>;
export type VoidInvoiceRequest = z.infer<typeof voidInvoiceRequestSchema>;
export type CreateInvoicePaymentRequest = z.infer<typeof createInvoicePaymentRequestSchema>;
