import { z } from 'zod';

const optionalUuidSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().uuid().optional());

const optionalSearchSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().trim().max(200).optional());

export const listLowStockAlertsQuerySchema = z
  .object({
    branch_id: optionalUuidSchema,
    product_id: optionalUuidSchema,
    category_id: optionalUuidSchema,
    q: optionalSearchSchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListLowStockAlertsQuery = z.infer<typeof listLowStockAlertsQuerySchema>;
