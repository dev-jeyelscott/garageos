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

const optionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

export const listStockBalancesQuerySchema = z
  .object({
    branch_id: optionalUuidSchema,
    product_id: optionalUuidSchema,
    category_id: optionalUuidSchema,
    q: optionalSearchSchema,
    low_stock: optionalBooleanQuerySchema.default(false),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListStockBalancesQuery = z.infer<typeof listStockBalancesQuerySchema>;
