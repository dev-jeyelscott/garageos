import { z } from 'zod';

const currentYearPlusOne = new Date().getUTCFullYear() + 1;

const optionalTextSchema = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).optional();

const yearSchema = z.coerce
  .number()
  .int()
  .min(1900)
  .max(currentYearPlusOne, `Year must be from 1900 through ${currentYearPlusOne}.`);

const motorcycleBaseRequestSchema = z
  .object({
    customer_id: z.string().trim().uuid(),
    brand: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    year: yearSchema.optional(),
    color: optionalTextSchema(80),
    plate_number: optionalTextSchema(50),
    engine_number: optionalTextSchema(100),
    chassis_number: optionalTextSchema(100),
    mileage: z.coerce.number().int().min(0),
  })
  .strict();

export const listMotorcyclesQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    customer_id: z.string().trim().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createMotorcycleRequestSchema = motorcycleBaseRequestSchema;

export const updateMotorcycleRequestSchema = motorcycleBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
    mileage_correction_reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListMotorcyclesQuery = z.infer<typeof listMotorcyclesQuerySchema>;
export type CreateMotorcycleRequest = z.infer<typeof createMotorcycleRequestSchema>;
export type UpdateMotorcycleRequest = z.infer<typeof updateMotorcycleRequestSchema>;
