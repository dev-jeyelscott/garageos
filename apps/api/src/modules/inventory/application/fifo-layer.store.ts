import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { INVENTORY_TRANSACTION_TYPES } from './inventory-ledger.store';

export const FIFO_LAYER_SOURCE_TRANSACTION_TYPES = {
  PURCHASE_RECEIVE: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
  INVENTORY_ADJUSTMENT_INCREASE: INVENTORY_TRANSACTION_TYPES.INVENTORY_ADJUSTMENT_INCREASE,
  INVENTORY_TRANSFER_IN: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_IN,
  REFUND_INVENTORY_REVERSAL: INVENTORY_TRANSACTION_TYPES.REFUND_INVENTORY_REVERSAL,
  VOID_INVENTORY_REVERSAL: INVENTORY_TRANSACTION_TYPES.VOID_INVENTORY_REVERSAL,
} as const;

export const FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES = Object.values(
  FIFO_LAYER_SOURCE_TRANSACTION_TYPES,
);

export type FifoLayerSourceTransactionType =
  (typeof FIFO_LAYER_SOURCE_TRANSACTION_TYPES)[keyof typeof FIFO_LAYER_SOURCE_TRANSACTION_TYPES];

export interface CreateFifoLayerInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly quantityReceived: string;
  readonly remainingQuantity: string;
  readonly unitCost: string;
  readonly sourceTransactionType: FifoLayerSourceTransactionType;
  readonly sourceTransactionId: string;
  readonly receivedAt: Date;
  readonly originalSourceLayerId: string | null;
}

export interface LockOpenFifoLayersForAllocationInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
}

export interface FifoLayerRecord extends CreateFifoLayerInput {}

export interface FifoLayerAllocationCandidateRecord extends FifoLayerRecord {
  readonly activeReservedQuantity: string;
  readonly allocatableQuantity: string;
}

export abstract class FifoLayerStore {
  abstract createLayer(
    input: CreateFifoLayerInput,
    client?: DatabaseQueryClient,
  ): Promise<FifoLayerRecord>;

  abstract lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]>;
}
