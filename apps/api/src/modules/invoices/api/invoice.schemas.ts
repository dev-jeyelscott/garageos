import { z } from 'zod';

import { INVOICE_STATUS_VALUES } from '../application/invoice.records';

const uuidSchema = z.string().uuid();

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

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CreateDraftInvoiceRequest = z.infer<typeof createDraftInvoiceRequestSchema>;
