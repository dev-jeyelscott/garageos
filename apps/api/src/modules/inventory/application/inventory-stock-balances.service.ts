import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { ListStockBalancesQuery } from '../api/inventory-stock-balances.schemas';
import { StockBalanceStore, type StockBalanceRecord } from './stock-balance.store';

export interface StockBalanceBranchResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface StockBalanceProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface StockBalanceProductResponse {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly status: 'active' | 'inactive';
  readonly category: StockBalanceProductCategoryResponse;
  readonly reorder_level: string;
}

export interface StockBalanceResponse {
  readonly branch: StockBalanceBranchResponse;
  readonly product: StockBalanceProductResponse;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly is_low_stock: boolean;
  readonly updated_at: string;
  readonly lock_version: number;
}

export interface StockBalanceListResponse {
  readonly stock_balances: readonly StockBalanceResponse[];
}

@Injectable()
export class InventoryStockBalancesService {
  constructor(
    @Inject(StockBalanceStore)
    private readonly stockBalanceStore: StockBalanceStore,
  ) {}

  async listStockBalances(
    query: ListStockBalancesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<StockBalanceListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.stockBalanceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInventoryPermission(context, isShopOwner, 'inventory.read');

    const branchIds = resolveBranchIdsForStockBalanceRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        stock_balances: [],
      };
    }

    const stockBalances = await this.stockBalanceStore.listStockBalances({
      tenantId: context.tenantId,
      branchIds,
      productId: query.product_id ?? null,
      categoryId: query.category_id ?? null,
      normalizedSearch: normalizeNullableText(query.q),
      lowStockOnly: query.low_stock,
      limit: query.limit,
    });

    return {
      stock_balances: stockBalances.map(toStockBalanceResponse),
    };
  }
}

function resolveBranchIdsForStockBalanceRead(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  const normalizedRequestedBranchId = normalizeNullableText(requestedBranchId);

  if (normalizedRequestedBranchId !== null) {
    assertBranchAccessAllowed({
      context,
      branchId: normalizedRequestedBranchId,
    });

    return [normalizedRequestedBranchId];
  }

  if (context.tenantWideBranchAccess) {
    return null;
  }

  return [
    ...new Set(
      context.assignedBranchIds
        .map((branchId) => branchId.trim())
        .filter((branchId) => branchId.length > 0),
    ),
  ];
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue.toLowerCase() : null;
}

function assertInventoryPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function toStockBalanceResponse(stockBalance: StockBalanceRecord): StockBalanceResponse {
  return {
    branch: {
      id: stockBalance.branchId,
      name: stockBalance.branchName,
      status: stockBalance.branchStatus,
    },
    product: {
      id: stockBalance.productId,
      name: stockBalance.productName,
      sku: stockBalance.sku,
      barcode: stockBalance.barcode,
      brand: stockBalance.brand,
      unit_of_measure: stockBalance.unitOfMeasure,
      status: stockBalance.productStatus,
      category: {
        id: stockBalance.categoryId,
        name: stockBalance.categoryName,
        status: stockBalance.categoryStatus,
      },
      reorder_level: stockBalance.reorderLevel,
    },
    on_hand_qty: stockBalance.onHandQty,
    reserved_qty: stockBalance.reservedQty,
    available_qty: stockBalance.availableQty,
    is_low_stock: stockBalance.isLowStock,
    updated_at: stockBalance.updatedAt.toISOString(),
    lock_version: stockBalance.lockVersion,
  };
}
