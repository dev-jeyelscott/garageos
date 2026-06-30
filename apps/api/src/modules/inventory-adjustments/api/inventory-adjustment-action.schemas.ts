import { z } from 'zod';

export const submitInventoryAdjustmentRequestSchema = z.object({}).strict();

export const approveInventoryAdjustmentRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const rejectInventoryAdjustmentRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const cancelInventoryAdjustmentRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const postInventoryAdjustmentRequestSchema = z.object({}).strict();

export type SubmitInventoryAdjustmentRequest = z.infer<
  typeof submitInventoryAdjustmentRequestSchema
>;
export type ApproveInventoryAdjustmentRequest = z.infer<
  typeof approveInventoryAdjustmentRequestSchema
>;
export type RejectInventoryAdjustmentRequest = z.infer<
  typeof rejectInventoryAdjustmentRequestSchema
>;
export type CancelInventoryAdjustmentRequest = z.infer<
  typeof cancelInventoryAdjustmentRequestSchema
>;
export type PostInventoryAdjustmentRequest = z.infer<typeof postInventoryAdjustmentRequestSchema>;
