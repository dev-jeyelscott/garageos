import { z } from 'zod';

const uuidSchema = z.string().trim().uuid();

const booleanQuerySchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return false;
    }

    if (value === 'true' || value === true) {
      return true;
    }

    if (value === 'false' || value === false) {
      return false;
    }

    return value;
  }, z.boolean())
  .default(false);

export const accountsPayableListQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    supplier_id: uuidSchema.optional(),
    include_zero: booleanQuerySchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const accountsPayableSummaryQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    supplier_id: uuidSchema.optional(),
    include_zero: booleanQuerySchema,
  })
  .strict();

export type AccountsPayableListQuery = z.infer<typeof accountsPayableListQuerySchema>;
export type AccountsPayableSummaryQuery = z.infer<typeof accountsPayableSummaryQuerySchema>;
