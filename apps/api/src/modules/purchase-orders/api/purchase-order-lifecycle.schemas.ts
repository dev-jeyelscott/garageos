import { z } from 'zod';

export const cancelPurchaseOrderRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type CancelPurchaseOrderRequest = z.infer<typeof cancelPurchaseOrderRequestSchema>;
