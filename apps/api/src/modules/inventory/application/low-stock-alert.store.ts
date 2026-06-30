import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type LowStockAlertStatus = 'active' | 'resolved';

export interface ListLowStockAlertsInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly productId: string | null;
  readonly categoryId: string | null;
  readonly normalizedSearch: string | null;
  readonly limit: number;
}

export interface RefreshLowStockAlertInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly evaluatedAt: Date;
}

export interface LowStockAlertRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly branchStatus: 'active' | 'inactive';
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly productStatus: 'active' | 'inactive';
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryStatus: 'active' | 'inactive';
  readonly availableQty: string;
  readonly reorderLevel: string;
  readonly status: LowStockAlertStatus;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
  readonly updatedAt: Date;
}

export interface LowStockAlertRefreshRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly availableQty: string;
  readonly reorderLevel: string;
  readonly status: LowStockAlertStatus;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
  readonly updatedAt: Date;
}

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export abstract class LowStockAlertStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listActiveAlerts(
    input: ListLowStockAlertsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly LowStockAlertRecord[]>;

  abstract refreshForStockBalance(
    input: RefreshLowStockAlertInput,
    client: DatabaseQueryClient,
  ): Promise<LowStockAlertRefreshRecord | null>;
}
