import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format is YYYY-MM-DD.')
  .refine(isValidDateOnly, 'Birthday must be a valid calendar date.');

const tagNameSchema = z.string().trim().min(1).max(50);

const customerBaseRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    mobile_number: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().email().max(254).optional(),
    address: z.string().trim().max(500).optional(),
    birthday: dateOnlySchema.optional(),
    notes: z.string().trim().max(2000).optional(),
    tags: z.array(tagNameSchema).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasMobileNumber =
      value.mobile_number !== undefined && value.mobile_number.trim().length > 0;
    const hasEmail = value.email !== undefined && value.email.trim().length > 0;

    if (!hasMobileNumber && !hasEmail) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mobile_number'],
        message: 'At least one contact method is required.',
      });
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'At least one contact method is required.',
      });
    }
  });

export const listCustomersQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    tag: z.union([tagNameSchema, z.array(tagNameSchema)]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const createCustomerRequestSchema = customerBaseRequestSchema;

export const updateCustomerRequestSchema = customerBaseRequestSchema
  .extend({
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

function isValidDateOnly(value: string): boolean {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
