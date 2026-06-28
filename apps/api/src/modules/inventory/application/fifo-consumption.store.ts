import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export interface CreateFifoConsumptionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly fifoLayerId: string;
  readonly quantityConsumed: string;
  readonly unitCost: string;
  readonly totalCost: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly consumedAt: Date;
}

export interface FifoConsumptionRecord extends CreateFifoConsumptionInput {}

export abstract class FifoConsumptionStore {
  abstract createConsumptions(
    inputs: readonly CreateFifoConsumptionInput[],
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoConsumptionRecord[]>;
}
