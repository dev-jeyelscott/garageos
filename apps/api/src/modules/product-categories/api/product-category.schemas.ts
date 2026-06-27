import { z } from 'zod';

const categoryNameSchema = z.string().trim().min(2).max(100);

export const listProductCategoriesQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createProductCategoryRequestSchema = z
  .object({
    name: categoryNameSchema,
  })
  .strict();

export const updateProductCategoryRequestSchema = createProductCategoryRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const productCategoryStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListProductCategoriesQuery = z.infer<typeof listProductCategoriesQuerySchema>;
export type CreateProductCategoryRequest = z.infer<typeof createProductCategoryRequestSchema>;
export type UpdateProductCategoryRequest = z.infer<typeof updateProductCategoryRequestSchema>;
export type ProductCategoryStatusChangeRequest = z.infer<
  typeof productCategoryStatusChangeRequestSchema
>;
