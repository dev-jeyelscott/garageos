import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  FifoConsumptionStore,
  type CreateFifoConsumptionInput,
  type FifoConsumptionRecord,
} from './fifo-consumption.store';

export interface CreateFifoConsumptionCommand {
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

@Injectable()
export class FifoConsumptionService {
  constructor(
    @Inject(FifoConsumptionStore)
    private readonly fifoConsumptionStore: FifoConsumptionStore,
  ) {}

  async createConsumptions(
    commands: readonly CreateFifoConsumptionCommand[],
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoConsumptionRecord[]> {
    return this.fifoConsumptionStore.createConsumptions(
      commands.map(toCreateFifoConsumptionInput),
      client,
    );
  }
}

function toCreateFifoConsumptionInput(
  command: CreateFifoConsumptionCommand,
): CreateFifoConsumptionInput {
  return {
    id: randomUUID(),
    tenantId: command.tenantId,
    branchId: command.branchId,
    productId: command.productId,
    fifoLayerId: command.fifoLayerId,
    quantityConsumed: command.quantityConsumed,
    unitCost: command.unitCost,
    totalCost: command.totalCost,
    sourceType: command.sourceType,
    sourceId: command.sourceId,
    consumedAt: command.consumedAt,
  };
}
