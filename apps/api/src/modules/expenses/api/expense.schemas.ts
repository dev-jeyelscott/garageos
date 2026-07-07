import { z } from 'zod';

const uuidSchema = z.string().trim().uuid();
const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u);
const moneySchema = z
  .string()
  .trim()
  .regex(/^(?:0\.[0-9][1-9]|0\.[1-9][0-9]|[1-9][0-9]{0,11}(?:\.[0-9]{2})?)$/u);

const paymentMethodSchema = z.enum([
  'cash',
  'gcash',
  'maya',
  'bank_transfer',
  'credit_card',
  'check',
  'other',
]);

const nullableTextSchema = z.string().trim().max(120).nullable().optional();
const reasonSchema = z.string().trim().min(1).max(500);

export const expenseIdParamsSchema = z
  .object({
    expense_id: uuidSchema,
  })
  .strict();

export const listExpensesQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    category_id: uuidSchema.optional(),
    status: z.enum(['active', 'voided', 'all']).default('active'),
    from_date: dateSchema.optional(),
    to_date: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const createExpenseRequestSchema = z
  .object({
    branch_id: uuidSchema,
    category_id: uuidSchema,
    expense_date: dateSchema,
    amount: moneySchema,
    payment_method: paymentMethodSchema,
    reference_number: nullableTextSchema,
    description: z.string().trim().min(1).max(1000),
  })
  .strict();

export const updateExpenseRequestSchema = createExpenseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
    reason: reasonSchema.optional(),
  })
  .strict();

export const voidExpenseRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: reasonSchema,
  })
  .strict();

export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;
export type UpdateExpenseRequest = z.infer<typeof updateExpenseRequestSchema>;
export type VoidExpenseRequest = z.infer<typeof voidExpenseRequestSchema>;
