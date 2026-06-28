import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const mechanicWorkSessionStatusSchema = z.enum(['active', 'paused', 'finished']);

const notesSchema = z.string().trim().max(2000).nullish();

export const listMechanicSessionsQuerySchema = z.object({
  branch_id: uuidSchema,
  job_order_id: uuidSchema.optional(),
  mechanic_user_id: uuidSchema.optional(),
  status: mechanicWorkSessionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createMechanicSessionRequestSchema = z.object({
  job_order_id: uuidSchema,
  notes: notesSchema,
});

export const finishMechanicSessionRequestSchema = z
  .object({
    notes: notesSchema,
  })
  .default({});

export type MechanicWorkSessionStatusRequest = z.infer<typeof mechanicWorkSessionStatusSchema>;
export type ListMechanicSessionsQuery = z.infer<typeof listMechanicSessionsQuerySchema>;
export type CreateMechanicSessionRequest = z.infer<typeof createMechanicSessionRequestSchema>;
export type FinishMechanicSessionRequest = z.infer<typeof finishMechanicSessionRequestSchema>;
