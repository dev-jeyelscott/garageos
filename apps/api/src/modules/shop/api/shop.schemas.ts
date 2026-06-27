import { z } from 'zod';

const businessHoursSchema = z.record(z.string(), z.unknown());

export const taxProfileSchema = z.enum(['vat_registered', 'non_vat', 'no_tax']);
export const taxModeSchema = z.enum(['tax_inclusive', 'tax_exclusive', 'no_tax']);

export const shopProfileRequestSchema = z
  .object({
    shop_name: z.string().trim().min(2).max(150),
    address: z.string().trim().min(5).max(500),
    contact_number: z.string().trim().min(1).max(50),
    email: z.string().trim().email(),
    business_hours: businessHoursSchema,
    tax_profile: taxProfileSchema,
    tax_mode: taxModeSchema,
    vat_rate: z.coerce.number().min(0).max(1).optional(),
    country: z.string().trim().length(2).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    currency: z.string().trim().length(3).optional(),
    invoice_prefix: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{2,10}-$/),
    receipt_footer_text: z.string().trim().max(500).nullable().optional(),
    reminder_sender_name: z.string().trim().max(100).nullable().optional(),
    default_invoice_due_days: z.coerce.number().int().min(0).max(365).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const taxComboValid =
      (value.tax_profile === 'vat_registered' &&
        ['tax_inclusive', 'tax_exclusive'].includes(value.tax_mode)) ||
      (['non_vat', 'no_tax'].includes(value.tax_profile) && value.tax_mode === 'no_tax');

    if (!taxComboValid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tax_mode'],
        message: 'Tax profile and tax mode combination is invalid.',
      });
    }
  });

export const renewalRequestSchema = z
  .object({
    message: z.string().trim().max(500).optional(),
  })
  .strict();

export type ShopProfileRequest = z.infer<typeof shopProfileRequestSchema>;
export type RenewalRequest = z.infer<typeof renewalRequestSchema>;
