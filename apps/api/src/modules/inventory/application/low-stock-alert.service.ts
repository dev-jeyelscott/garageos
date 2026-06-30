import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { ListLowStockAlertsQuery } from '../api/inventory-low-stock-alerts.schemas';
import {
  LowStockAlertStore,
  type LowStockAlertRecord,
  type LowStockAlertRefreshRecord,
} from './low-stock-alert.store';
import type { StockAvailabilitySnapshot } from './inventory-stock-balances.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LowStockAlertBranchResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface LowStockAlertProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface LowStockAlertProductResponse {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly status: 'active' | 'inactive';
  readonly category: LowStockAlertProductCategoryResponse;
}

export interface LowStockAlertResponse {
  readonly id: string;
  readonly branch: LowStockAlertBranchResponse;
  readonly product: LowStockAlertProductResponse;
  readonly available_qty: string;
  readonly reorder_level: string;
  readonly status: 'active';
  readonly triggered_at: string;
  readonly updated_at: string;
}

export interface LowStockAlertListResponse {
  readonly low_stock_alerts: readonly LowStockAlertResponse[];
}

@Injectable()
export class LowStockAlertService {
  constructor(
    @Inject(LowStockAlertStore)
    private readonly lowStockAlertStore: LowStockAlertStore,
  ) {}

  async listActiveAlerts(
    query: ListLowStockAlertsQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<LowStockAlertListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.lowStockAlertStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInventoryPermission(context, isShopOwner, 'inventory.read');

    const branchIds = resolveBranchIdsForAlertRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        low_stock_alerts: [],
      };
    }

    const alerts = await this.lowStockAlertStore.listActiveAlerts({
      tenantId: context.tenantId,
      branchIds,
      productId: query.product_id ?? null,
      categoryId: query.category_id ?? null,
      normalizedSearch: normalizeNullableText(query.q),
      limit: query.limit,
    });

    return {
      low_stock_alerts: alerts.map(toLowStockAlertResponse),
    };
  }

  async refreshForStockAvailability(
    stockAvailability: StockAvailabilitySnapshot,
    client: DatabaseQueryClient,
  ): Promise<LowStockAlertRefreshRecord | null> {
    return this.lowStockAlertStore.refreshForStockBalance(
      {
        id: randomUUID(),
        tenantId: normalizeUuid(stockAvailability.tenant_id, 'tenant_id'),
        branchId: normalizeUuid(stockAvailability.branch_id, 'branch_id'),
        productId: normalizeUuid(stockAvailability.product_id, 'product_id'),
        evaluatedAt: new Date(),
      },
      client,
    );
  }
}

function resolveBranchIdsForAlertRead(
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

function normalizeUuid(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_uuid',
        message: `${field} must be a valid UUID.`,
      },
    ]);
  }

  return normalizedValue;
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

function toLowStockAlertResponse(alert: LowStockAlertRecord): LowStockAlertResponse {
  return {
    id: alert.id,
    branch: {
      id: alert.branchId,
      name: alert.branchName,
      status: alert.branchStatus,
    },
    product: {
      id: alert.productId,
      name: alert.productName,
      sku: alert.sku,
      barcode: alert.barcode,
      brand: alert.brand,
      unit_of_measure: alert.unitOfMeasure,
      status: alert.productStatus,
      category: {
        id: alert.categoryId,
        name: alert.categoryName,
        status: alert.categoryStatus,
      },
    },
    available_qty: alert.availableQty,
    reorder_level: alert.reorderLevel,
    status: 'active',
    triggered_at: alert.triggeredAt.toISOString(),
    updated_at: alert.updatedAt.toISOString(),
  };
}
