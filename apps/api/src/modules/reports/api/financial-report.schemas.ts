import { z } from 'zod';

const uuidSchema = z.string().trim().uuid();
const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const financialReportQuerySchema = z
  .object({
    branch_id: uuidSchema.optional(),
    from_date: dateOnlySchema.optional(),
    to_date: dateOnlySchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from_date !== undefined &&
      query.to_date !== undefined &&
      query.from_date > query.to_date
    ) {
      context.addIssue({
        code: 'custom',
        path: ['to_date'],
        message: 'to_date must be on or after from_date.',
      });
    }
  });

export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;
