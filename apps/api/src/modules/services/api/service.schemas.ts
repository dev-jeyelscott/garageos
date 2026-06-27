import { z } from 'zod';

const MAX_MONEY = 999_999_999_999.99;

const optionalTextSchema = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).optional();

const moneySchema = z.preprocess(
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a non-negative decimal with up to 2 decimals.')
    .transform((value) => normalizeMoneyString(value))
    .refine((value) => Number(value) <= MAX_MONEY, {
      message: 'Amount is too large.',
    }),
);

const serviceBaseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    starting_price: moneySchema,
    variable_price: z.coerce.boolean(),
    price_disclaimer: optionalTextSchema(500),
    description: optionalTextSchema(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.variable_price && value.price_disclaimer === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['price_disclaimer'],
        message: 'Price disclaimer is required when variable_price is true.',
      });
    }
  });

export const listServicesQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createServiceRequestSchema = serviceBaseRequestSchema;

export const updateServiceRequestSchema = serviceBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.variable_price && value.price_disclaimer === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['price_disclaimer'],
        message: 'Price disclaimer is required when variable_price is true.',
      });
    }
  });

export const serviceStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type ServiceStatusChangeRequest = z.infer<typeof serviceStatusChangeRequestSchema>;

function normalizeMoneyString(value: string): string {
  const [wholePart, decimalPart = ''] = value.split('.');

  return `${wholePart}.${decimalPart.padEnd(2, '0')}`;
}
