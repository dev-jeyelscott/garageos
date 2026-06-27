import { z } from 'zod';

const permissionCodeSchema = z.string().trim().min(1).max(150);

export const createRoleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    permission_codes: z.array(permissionCodeSchema).min(1),
  })
  .strict();

export const updateRoleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    permission_codes: z.array(permissionCodeSchema).min(1).optional(),
    change_reason: z.string().trim().max(500).optional(),
    lock_version: z.coerce.number().int().min(0),
  })
  .strict()
  .refine((request) => request.name !== undefined || request.permission_codes !== undefined, {
    path: ['name'],
    message: 'At least one mutable role field is required.',
  });

export const deactivateRoleRequestSchema = z
  .object({
    lock_version: z.coerce.number().int().min(0),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
export type DeactivateRoleRequest = z.infer<typeof deactivateRoleRequestSchema>;
