import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type StockBalanceBranchStatus = 'active' | 'inactive';
export type StockBalanceProductStatus = 'active' | 'inactive';
export type StockBalanceCategoryStatus = 'active' | 'inactive';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ListStockBalancesInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly productId: string | null;
  readonly categoryId: string | null;
  readonly normalizedSearch: string | null;
  readonly lowStockOnly: boolean;
  readonly limit: number;
}

export interface GetStockAvailabilityInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
}

export interface IncrementReservedQuantityInput extends GetStockAvailabilityInput {
  readonly reservedQuantityDelta: string;
}

export interface StockBalanceRecord {
  readonly tenantId: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly branchStatus: StockBalanceBranchStatus;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly productStatus: StockBalanceProductStatus;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryStatus: StockBalanceCategoryStatus;
  readonly reorderLevel: string;
  readonly onHandQty: string;
  readonly reservedQty: string;
  readonly availableQty: string;
  readonly isLowStock: boolean;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface StockAvailabilityRecord {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly onHandQty: string;
  readonly reservedQty: string;
  readonly availableQty: string;
  readonly lockVersion: number;
}

export abstract class StockBalanceStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listStockBalances(
    input: ListStockBalancesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly StockBalanceRecord[]>;

  abstract getStockAvailability(
    input: GetStockAvailabilityInput,
    client?: DatabaseQueryClient,
  ): Promise<StockAvailabilityRecord | null>;

  abstract lockStockAvailabilityForUpdate(
    input: GetStockAvailabilityInput,
    client?: DatabaseQueryClient,
  ): Promise<StockAvailabilityRecord | null>;

  incrementReservedQuantity(
    _input: IncrementReservedQuantityInput,
    _client?: DatabaseQueryClient,
  ): Promise<StockAvailabilityRecord | null> {
    throw new Error('StockBalanceStore.incrementReservedQuantity is not implemented.');
  }
}
