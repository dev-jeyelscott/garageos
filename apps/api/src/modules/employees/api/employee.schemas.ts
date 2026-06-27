import { z } from 'zod';

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

export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
export type EmployeeStatusChangeRequest = z.infer<typeof employeeStatusChangeRequestSchema>;
export type CreateEmployeeInvitationRequest = z.infer<typeof createEmployeeInvitationRequestSchema>;
