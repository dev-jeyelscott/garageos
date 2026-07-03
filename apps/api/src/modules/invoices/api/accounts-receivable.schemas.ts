import { z } from 'zod';

const uuidSchema = z.string().uuid();
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Business date must use YYYY-MM-DD format.',
  })
  .refine(isValidBusinessDate, {
    message: 'Business date must be a valid calendar date.',
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
const accountsReceivableStatusSchema = z.enum(['pending', 'partially_paid', 'overdue']);

function isValidBusinessDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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
    from_date: businessDateSchema.optional(),
    to_date: businessDateSchema.optional(),
    as_of_date: businessDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine(validateDateRange);

export const summarizeAccountsReceivableQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    customer_id: uuidSchema.optional(),
    from_date: businessDateSchema.optional(),
    to_date: businessDateSchema.optional(),
    as_of_date: businessDateSchema.optional(),
  })
  .superRefine(validateDateRange);

export type ListAccountsReceivableQuery = z.infer<typeof listAccountsReceivableQuerySchema>;
export type SummarizeAccountsReceivableQuery = z.infer<
  typeof summarizeAccountsReceivableQuerySchema
>;
