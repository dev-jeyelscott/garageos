import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { FifoLayerSourceTransactionType } from './fifo-layer.store';
import type { InventoryTransactionType } from './inventory-ledger.store';

export type InventoryReadBranchStatus = 'active' | 'inactive';
export type InventoryReadProductStatus = 'active' | 'inactive';
export type InventoryReadCategoryStatus = 'active' | 'inactive';

export interface InventoryReadShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface InventoryReadBranchRecord {
  readonly id: string;
  readonly name: string;
  readonly status: InventoryReadBranchStatus;
}

export interface InventoryReadProductCategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly status: InventoryReadCategoryStatus;
}

export interface InventoryReadProductRecord {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly status: InventoryReadProductStatus;
  readonly category: InventoryReadProductCategoryRecord;
  readonly reorderLevel: string;
}

export interface ListProductStockInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly productId: string;
  readonly limit: number;
}

export interface InventoryReadStockBalanceRecord {
  readonly branch: InventoryReadBranchRecord;
  readonly product: InventoryReadProductRecord;
  readonly onHandQty: string;
  readonly reservedQty: string;
  readonly availableQty: string;
  readonly isLowStock: boolean;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface ListProductFifoLayersInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly productId: string;
  readonly openOnly: boolean;
  readonly limit: number;
}

export interface InventoryReadFifoLayerRecord {
  readonly id: string;
  readonly branch: InventoryReadBranchRecord;
  readonly product: InventoryReadProductRecord;
  readonly quantityReceived: string;
  readonly remainingQuantity: string;
  readonly activeReservedQuantity: string;
  readonly allocatableQuantity: string;
  readonly unitCost: string;
  readonly sourceTransactionType: FifoLayerSourceTransactionType;
  readonly sourceTransactionId: string;
  readonly receivedAt: Date;
  readonly originalSourceLayerId: string | null;
}

export interface ListInventoryLedgerEntriesInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly productId: string | null;
  readonly transactionType: InventoryTransactionType | null;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly fromOccurredAt: Date | null;
  readonly toOccurredAt: Date | null;
  readonly limit: number;
}

export interface InventoryReadLedgerEntryRecord {
  readonly id: string;
  readonly branch: InventoryReadBranchRecord;
  readonly product: InventoryReadProductRecord;
  readonly transactionType: InventoryTransactionType;
  readonly quantityDeltaOnHand: string;
  readonly quantityDeltaReserved: string;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly occurredAt: Date;
  readonly createdByUserId: string | null;
}

export abstract class InventoryReadStore {
  abstract isActiveShopOwner(input: InventoryReadShopOwnerCheckInput): Promise<boolean>;

  abstract listProductStock(
    input: ListProductStockInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryReadStockBalanceRecord[]>;

  abstract listProductFifoLayers(
    input: ListProductFifoLayersInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryReadFifoLayerRecord[]>;

  abstract listInventoryLedgerEntries(
    input: ListInventoryLedgerEntriesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryReadLedgerEntryRecord[]>;
}
