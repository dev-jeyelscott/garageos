import { z } from 'zod';

const categoryNameSchema = z.string().trim().min(2).max(120);

export const listExpenseCategoriesQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createExpenseCategoryRequestSchema = z
  .object({
    name: categoryNameSchema,
  })
  .strict();

export const updateExpenseCategoryRequestSchema = createExpenseCategoryRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const expenseCategoryStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListExpenseCategoriesQuery = z.infer<typeof listExpenseCategoriesQuerySchema>;
export type CreateExpenseCategoryRequest = z.infer<typeof createExpenseCategoryRequestSchema>;
export type UpdateExpenseCategoryRequest = z.infer<typeof updateExpenseCategoryRequestSchema>;
export type ExpenseCategoryStatusChangeRequest = z.infer<
  typeof expenseCategoryStatusChangeRequestSchema
>;
