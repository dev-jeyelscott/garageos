import { z } from 'zod';

const uuidSchema = z.string().trim().uuid();

export const createEmployeeRequestSchema = z
  .object({
    full_name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(320),
    mobile_number: z.string().trim().min(1).max(50).nullable().optional(),
  })
  .strict();

export const updateEmployeeRequestSchema = z
  .object({
    full_name: z.string().trim().min(1).max(150),
    mobile_number: z.string().trim().min(1).max(50).nullable().optional(),
    lock_version: z.coerce.number().int().min(0),
  })
  .strict();

export const assignEmployeeRolesRequestSchema = z
  .object({
    role_ids: z.array(uuidSchema).min(1),
    lock_version: z.coerce.number().int().min(0),
    change_reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const assignEmployeeBranchesRequestSchema = z
  .object({
    branch_ids: z.array(uuidSchema).optional(),
    tenant_wide_branch_access: z.boolean().optional(),
    lock_version: z.coerce.number().int().min(0),
    change_reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (request) =>
      request.tenant_wide_branch_access === true ||
      (request.branch_ids !== undefined && request.branch_ids.length > 0),
    {
      path: ['branch_ids'],
      message: 'At least one branch is required unless tenant_wide_branch_access is true.',
    },
  );

export const employeeStatusChangeRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const createEmployeeInvitationRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

export const revokeEmployeeInvitationRequestSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
export type AssignEmployeeRolesRequest = z.infer<typeof assignEmployeeRolesRequestSchema>;
export type AssignEmployeeBranchesRequest = z.infer<typeof assignEmployeeBranchesRequestSchema>;
export type EmployeeStatusChangeRequest = z.infer<typeof employeeStatusChangeRequestSchema>;
export type CreateEmployeeInvitationRequest = z.infer<typeof createEmployeeInvitationRequestSchema>;
export type RevokeEmployeeInvitationRequest = z.infer<typeof revokeEmployeeInvitationRequestSchema>;
