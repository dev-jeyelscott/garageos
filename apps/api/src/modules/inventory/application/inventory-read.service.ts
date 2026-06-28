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
import type {
  ListInventoryLedgerQuery,
  ProductFifoLayersQuery,
  ProductInventoryStockQuery,
} from '../api/inventory-read.schemas';
import {
  InventoryReadStore,
  type InventoryReadFifoLayerRecord,
  type InventoryReadLedgerEntryRecord,
  type InventoryReadStockBalanceRecord,
} from './inventory-read.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InventoryReadBranchResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface InventoryReadProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface InventoryReadProductResponse {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly status: 'active' | 'inactive';
  readonly category: InventoryReadProductCategoryResponse;
  readonly reorder_level: string;
}

export interface InventoryReadStockBalanceResponse {
  readonly branch: InventoryReadBranchResponse;
  readonly product: InventoryReadProductResponse;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly is_low_stock: boolean;
  readonly updated_at: string;
  readonly lock_version: number;
}

export interface ProductInventoryStockListResponse {
  readonly stock_balances: readonly InventoryReadStockBalanceResponse[];
}

export interface InventoryReadFifoLayerResponse {
  readonly id: string;
  readonly branch: InventoryReadBranchResponse;
  readonly product: InventoryReadProductResponse;
  readonly quantity_received: string;
  readonly remaining_quantity: string;
  readonly active_reserved_quantity: string;
  readonly allocatable_quantity: string;
  readonly unit_cost: string;
  readonly source_transaction_type: string;
  readonly source_transaction_id: string;
  readonly received_at: string;
  readonly original_source_layer_id: string | null;
}

export interface ProductFifoLayerListResponse {
  readonly fifo_layers: readonly InventoryReadFifoLayerResponse[];
}

export interface InventoryReadLedgerEntryResponse {
  readonly id: string;
  readonly branch: InventoryReadBranchResponse;
  readonly product: InventoryReadProductResponse;
  readonly transaction_type: string;
  readonly quantity_delta_on_hand: string;
  readonly quantity_delta_reserved: string;
  readonly unit_cost: string | null;
  readonly total_cost: string | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly occurred_at: string;
  readonly created_by_user_id: string | null;
}

export interface InventoryLedgerEntryListResponse {
  readonly ledger_entries: readonly InventoryReadLedgerEntryResponse[];
}

@Injectable()
export class InventoryReadService {
  constructor(
    @Inject(InventoryReadStore)
    private readonly inventoryReadStore: InventoryReadStore,
  ) {}

  async listProductStock(
    productId: string,
    query: ProductInventoryStockQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductInventoryStockListResponse> {
    const context = await this.resolveReadContext(session);
    const branchIds = resolveBranchIdsForInventoryRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        stock_balances: [],
      };
    }

    const stockBalances = await this.inventoryReadStore.listProductStock({
      tenantId: context.tenantId,
      branchIds,
      productId: normalizeUuid(productId, 'product_id'),
      limit: query.limit,
    });

    return {
      stock_balances: stockBalances.map(toStockBalanceResponse),
    };
  }

  async listProductFifoLayers(
    productId: string,
    query: ProductFifoLayersQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductFifoLayerListResponse> {
    const context = await this.resolveReadContext(session);
    const branchIds = resolveBranchIdsForInventoryRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        fifo_layers: [],
      };
    }

    const fifoLayers = await this.inventoryReadStore.listProductFifoLayers({
      tenantId: context.tenantId,
      branchIds,
      productId: normalizeUuid(productId, 'product_id'),
      openOnly: query.open_only,
      limit: query.limit,
    });

    return {
      fifo_layers: fifoLayers.map(toFifoLayerResponse),
    };
  }

  async listInventoryLedgerEntries(
    query: ListInventoryLedgerQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryLedgerEntryListResponse> {
    const context = await this.resolveReadContext(session);
    const branchIds = resolveBranchIdsForInventoryRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        ledger_entries: [],
      };
    }

    const ledgerEntries = await this.inventoryReadStore.listInventoryLedgerEntries({
      tenantId: context.tenantId,
      branchIds,
      productId: query.product_id ?? null,
      transactionType: query.transaction_type ?? null,
      sourceType: query.source_type ?? null,
      sourceId: query.source_id ?? null,
      fromOccurredAt: query.from_occurred_at ?? null,
      toOccurredAt: query.to_occurred_at ?? null,
      limit: query.limit,
    });

    return {
      ledger_entries: ledgerEntries.map(toLedgerEntryResponse),
    };
  }

  private async resolveReadContext(
    session: TenantContextAuthenticatedSession,
  ): Promise<ResolvedTenantContext> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.inventoryReadStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInventoryReadPermission(context, isShopOwner);

    return context;
  }
}

function resolveBranchIdsForInventoryRead(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  const normalizedRequestedBranchId =
    requestedBranchId === null ? null : normalizeUuid(requestedBranchId, 'branch_id');

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

function assertInventoryReadPermission(context: ResolvedTenantContext, isShopOwner: boolean): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.read')) {
    throw GarageOsApiException.forbidden('inventory.read');
  }
}

function toStockBalanceResponse(
  stockBalance: InventoryReadStockBalanceRecord,
): InventoryReadStockBalanceResponse {
  return {
    branch: toBranchResponse(stockBalance.branch),
    product: toProductResponse(stockBalance.product),
    on_hand_qty: stockBalance.onHandQty,
    reserved_qty: stockBalance.reservedQty,
    available_qty: stockBalance.availableQty,
    is_low_stock: stockBalance.isLowStock,
    updated_at: stockBalance.updatedAt.toISOString(),
    lock_version: stockBalance.lockVersion,
  };
}

function toFifoLayerResponse(
  fifoLayer: InventoryReadFifoLayerRecord,
): InventoryReadFifoLayerResponse {
  return {
    id: fifoLayer.id,
    branch: toBranchResponse(fifoLayer.branch),
    product: toProductResponse(fifoLayer.product),
    quantity_received: fifoLayer.quantityReceived,
    remaining_quantity: fifoLayer.remainingQuantity,
    active_reserved_quantity: fifoLayer.activeReservedQuantity,
    allocatable_quantity: fifoLayer.allocatableQuantity,
    unit_cost: fifoLayer.unitCost,
    source_transaction_type: fifoLayer.sourceTransactionType,
    source_transaction_id: fifoLayer.sourceTransactionId,
    received_at: fifoLayer.receivedAt.toISOString(),
    original_source_layer_id: fifoLayer.originalSourceLayerId,
  };
}

function toLedgerEntryResponse(
  ledgerEntry: InventoryReadLedgerEntryRecord,
): InventoryReadLedgerEntryResponse {
  return {
    id: ledgerEntry.id,
    branch: toBranchResponse(ledgerEntry.branch),
    product: toProductResponse(ledgerEntry.product),
    transaction_type: ledgerEntry.transactionType,
    quantity_delta_on_hand: ledgerEntry.quantityDeltaOnHand,
    quantity_delta_reserved: ledgerEntry.quantityDeltaReserved,
    unit_cost: ledgerEntry.unitCost,
    total_cost: ledgerEntry.totalCost,
    source_type: ledgerEntry.sourceType,
    source_id: ledgerEntry.sourceId,
    occurred_at: ledgerEntry.occurredAt.toISOString(),
    created_by_user_id: ledgerEntry.createdByUserId,
  };
}

function toBranchResponse(
  branch: InventoryReadStockBalanceRecord['branch'],
): InventoryReadBranchResponse {
  return {
    id: branch.id,
    name: branch.name,
    status: branch.status,
  };
}

function toProductResponse(
  product: InventoryReadStockBalanceRecord['product'],
): InventoryReadProductResponse {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    unit_of_measure: product.unitOfMeasure,
    status: product.status,
    category: {
      id: product.category.id,
      name: product.category.name,
      status: product.category.status,
    },
    reorder_level: product.reorderLevel,
  };
}
