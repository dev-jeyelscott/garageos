import { z } from 'zod';

const businessHoursSchema = z.record(z.string(), z.unknown());
const uuidSchema = z.string().trim().uuid();
const nullableTextSchema = z.string().trim().max(500).nullable().optional();
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    status: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const createBranchRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    address: z.string().trim().min(1).max(500),
    contact_number: z.string().trim().min(1).max(50),
    business_hours: businessHoursSchema,
  })
  .strict();

export const updateBranchRequestSchema = createBranchRequestSchema.partial().strict();

export const createRoleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    permission_codes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  })
  .strict();

export const updateRoleRequestSchema = createRoleRequestSchema.partial().strict();

export const updateEmployeeRequestSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200).optional(),
    mobile_number: z.string().trim().min(1).max(50).nullable().optional(),
    tenant_wide_branch_access: z.boolean().optional(),
    role_ids: z.array(uuidSchema).min(1).max(20).optional(),
    branch_ids: z.array(uuidSchema).max(50).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.tenant_wide_branch_access !== true && value.branch_ids?.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch_ids'],
        message: 'At least one branch is required unless tenant_wide_branch_access is true.',
      });
    }
  });

const customerFieldsSchema = z.object({
  name: z.string().trim().min(2).max(150),
  mobile_number: z.string().trim().min(1).max(50).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  address: nullableTextSchema,
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: nullableTextSchema,
});

export const createCustomerRequestSchema = customerFieldsSchema
  .strict()
  .superRefine((value, context) => {
    if (!value.mobile_number && !value.email) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mobile_number'],
        message: 'Customer requires at least one contact method.',
      });
    }
  });

export const updateCustomerRequestSchema = customerFieldsSchema.partial().strict();

export const mergeCustomersRequestSchema = z
  .object({
    source_customer_id: uuidSchema,
    surviving_customer_id: uuidSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((value) => value.source_customer_id !== value.surviving_customer_id, {
    path: ['surviving_customer_id'],
    message: 'Surviving customer must differ from source customer.',
  });

export const createMotorcycleRequestSchema = z
  .object({
    customer_id: uuidSchema,
    brand: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
    color: z.string().trim().min(1).max(50).nullable().optional(),
    plate_number: z.string().trim().min(1).max(50).nullable().optional(),
    engine_number: z.string().trim().min(1).max(100).nullable().optional(),
    chassis_number: z.string().trim().min(1).max(100).nullable().optional(),
    latest_mileage: z.coerce.number().int().min(0),
  })
  .strict();

export const updateMotorcycleRequestSchema = createMotorcycleRequestSchema.partial().strict();

export const mileageCorrectionRequestSchema = z
  .object({
    new_mileage: z.coerce.number().int().min(0),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const serviceFieldsSchema = z.object({
  name: z.string().trim().min(2).max(150),
  starting_price: z.coerce.number().min(0).max(999999999999.99),
  variable_price: z.boolean().optional(),
  price_disclaimer: z.string().trim().min(1).max(500).nullable().optional(),
  description: nullableTextSchema,
});

export const createServiceRequestSchema = serviceFieldsSchema
  .strict()
  .superRefine((value, context) => {
    if (value.variable_price === true && !value.price_disclaimer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price_disclaimer'],
        message: 'Price disclaimer is required for variable-price services.',
      });
    }
  });

export const updateServiceRequestSchema = serviceFieldsSchema.partial().strict();

export const actionReasonRequestSchema = reasonSchema;

export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type MergeCustomersRequest = z.infer<typeof mergeCustomersRequestSchema>;
export type CreateMotorcycleRequest = z.infer<typeof createMotorcycleRequestSchema>;
export type UpdateMotorcycleRequest = z.infer<typeof updateMotorcycleRequestSchema>;
export type MileageCorrectionRequest = z.infer<typeof mileageCorrectionRequestSchema>;
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type ActionReasonRequest = z.infer<typeof actionReasonRequestSchema>;
