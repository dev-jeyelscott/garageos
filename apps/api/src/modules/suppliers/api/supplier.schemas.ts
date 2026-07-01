import { z } from 'zod';

const optionalTextSchema = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    return value;
  }, z.string().trim().min(1).max(maxLength).optional());

const supplierBaseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    contact_person: optionalTextSchema(150),
    mobile_number: optionalTextSchema(50),
    email: optionalTextSchema(254),
    address: optionalTextSchema(500),
    notes: optionalTextSchema(1000),
  })
  .strict();

export const listSuppliersQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const createSupplierRequestSchema = supplierBaseRequestSchema;

export const updateSupplierRequestSchema = supplierBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const supplierStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;
export type SupplierStatusChangeRequest = z.infer<typeof supplierStatusChangeRequestSchema>;
