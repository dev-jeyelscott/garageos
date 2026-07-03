import { z } from 'zod';

const uuidSchema = z.string().uuid();
const accountsReceivableStatusSchema = z.enum(['pending', 'partially_paid', 'overdue']);

function validateDateRange(
  value: {
    readonly from_date?: Date | undefined;
    readonly to_date?: Date | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.from_date !== undefined &&
    value.to_date !== undefined &&
    value.to_date < value.from_date
  ) {
    context.addIssue({
      code: 'custom',
      path: ['to_date'],
      message: 'To date must be on or after from date.',
    });
  }
}

export const listAccountsReceivableQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    customer_id: uuidSchema.optional(),
    status: accountsReceivableStatusSchema.optional(),
    from_date: z.coerce.date().optional(),
    to_date: z.coerce.date().optional(),
    as_of_date: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine(validateDateRange);

export const summarizeAccountsReceivableQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    customer_id: uuidSchema.optional(),
    from_date: z.coerce.date().optional(),
    to_date: z.coerce.date().optional(),
    as_of_date: z.coerce.date().optional(),
  })
  .superRefine(validateDateRange);

export type ListAccountsReceivableQuery = z.infer<typeof listAccountsReceivableQuerySchema>;
export type SummarizeAccountsReceivableQuery = z.infer<
  typeof summarizeAccountsReceivableQuerySchema
>;
