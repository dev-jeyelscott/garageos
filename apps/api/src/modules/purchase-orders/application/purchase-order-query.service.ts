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
import { ProductStore } from '../../products/application/product.store';
import type { PurchaseOrderListQuery } from '../api/purchase-order-query.schemas';
import type { PurchaseOrderLineRecord, PurchaseOrderRecord } from './purchase-order.records';
import { PurchaseOrderStore } from './purchase-order.store';
import { PurchaseOrderListCursor, PurchaseOrderQueryStore } from './purchase-order-query.store';

export interface PurchaseOrderLineResponse {
  readonly id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly ordered_quantity: string;
  readonly received_quantity: string;
  readonly unit_cost: string;
  readonly line_total: string;
  readonly notes: string | null;
}

export interface PurchaseOrderResponse {
  readonly id: string;
  readonly purchase_order_number: string;
  readonly status: PurchaseOrderRecord['status'];
  readonly payment_terms: PurchaseOrderRecord['paymentTerms'];
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly supplier_id: string;
  readonly supplier_name: string | null;
  readonly order_date: string;
  readonly expected_receive_date: string | null;
  readonly ordered_total_amount: string;
  readonly received_total_amount: string;
  readonly ordered_line_count: number;
  readonly received_line_count: number;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly line_items: readonly PurchaseOrderLineResponse[];
  readonly receiving_status_summary: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface PurchaseOrderPaginationResponse {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface PurchaseOrderListResponse {
  readonly purchase_orders: readonly PurchaseOrderResponse[];
  readonly pagination: PurchaseOrderPaginationResponse;
}

export interface PurchaseOrderDetailResponse {
  readonly purchase_order: PurchaseOrderResponse;
}

@Injectable()
export class PurchaseOrderQueryService {
  constructor(
    @Inject(PurchaseOrderQueryStore)
    private readonly purchaseOrderQueryStore: PurchaseOrderQueryStore,
    @Inject(PurchaseOrderStore)
    private readonly purchaseOrderStore: PurchaseOrderStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
  ) {}

  async listPurchaseOrders(
    query: PurchaseOrderListQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<PurchaseOrderListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertPurchasePermission(context, isShopOwner, 'purchases.read');

    const branchIds = resolveReadableBranchIds(context, query.branch_id ?? null);
    const limit = query.limit;

    if (branchIds !== null && branchIds.length === 0) {
      return {
        purchase_orders: [],
        pagination: {
          limit,
          has_more: false,
          next_cursor: null,
        },
      };
    }

    const purchaseOrders = await this.purchaseOrderQueryStore.listPurchaseOrders({
      tenantId: context.tenantId,
      branchIds,
      normalizedSearch: normalizeSearchQuery(query.q),
      status: query.status,
      fromDate: query.from_date ?? null,
      toDate: query.to_date ?? null,
      limit: limit + 1,
      cursor: decodePurchaseOrderListCursor(query.cursor),
    });
    const visiblePurchaseOrders = purchaseOrders.slice(0, limit);
    const hasMore = purchaseOrders.length > limit;

    return {
      purchase_orders: visiblePurchaseOrders.map(toPurchaseOrderResponse),
      pagination: {
        limit,
        has_more: hasMore,
        next_cursor: hasMore
          ? encodePurchaseOrderListCursor(visiblePurchaseOrders.at(-1) ?? null)
          : null,
      },
    };
  }

  async getPurchaseOrder(
    purchaseOrderId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<PurchaseOrderDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertPurchasePermission(context, isShopOwner, 'purchases.read');

    const purchaseOrder = await this.purchaseOrderStore.findPurchaseOrderById(
      context.tenantId,
      purchaseOrderId.trim(),
    );

    if (purchaseOrder === null) {
      throw GarageOsApiException.resourceNotFound('Purchase order was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: purchaseOrder.branchId });

    return {
      purchase_order: toPurchaseOrderResponse(purchaseOrder),
    };
  }
}

function resolveReadableBranchIds(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  if (requestedBranchId !== null) {
    assertBranchAccessAllowed({ context, branchId: requestedBranchId });

    return [requestedBranchId];
  }

  if (context.tenantWideBranchAccess) {
    return null;
  }

  return context.assignedBranchIds;
}

function assertPurchasePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function toPurchaseOrderResponse(purchaseOrder: PurchaseOrderRecord): PurchaseOrderResponse {
  const orderedTotalAmount = sumMoneyAmounts(
    purchaseOrder.lines.map((line) => calculateLineTotal(line.orderedQuantity, line.unitCost)),
  );
  const receivedTotalAmount = sumMoneyAmounts(
    purchaseOrder.lines.map((line) => calculateLineTotal(line.receivedQuantity, line.unitCost)),
  );
  const receivedLineCount = purchaseOrder.lines.filter(
    (line) => compareQuantities(line.receivedQuantity, '0.000') > 0,
  ).length;

  return {
    id: purchaseOrder.id,
    purchase_order_number: purchaseOrder.purchaseOrderNumber,
    status: purchaseOrder.status,
    payment_terms: purchaseOrder.paymentTerms,
    branch_id: purchaseOrder.branchId,
    branch_name: purchaseOrder.branchName,
    supplier_id: purchaseOrder.supplierId,
    supplier_name: purchaseOrder.supplierName,
    order_date: purchaseOrder.orderDate,
    expected_receive_date: purchaseOrder.expectedReceiveDate,
    ordered_total_amount: orderedTotalAmount,
    received_total_amount: receivedTotalAmount,
    ordered_line_count: purchaseOrder.lines.length,
    received_line_count: receivedLineCount,
    lock_version: purchaseOrder.lockVersion,
    created_at: purchaseOrder.createdAt.toISOString(),
    updated_at: purchaseOrder.updatedAt.toISOString(),
    line_items: purchaseOrder.lines.map(toPurchaseOrderLineResponse),
    receiving_status_summary: [
      { label: 'Status', value: purchaseOrder.status },
      { label: 'Ordered total', value: orderedTotalAmount },
      { label: 'Received total', value: receivedTotalAmount },
    ],
  };
}

function toPurchaseOrderLineResponse(line: PurchaseOrderLineRecord): PurchaseOrderLineResponse {
  return {
    id: line.id,
    product_id: line.productId,
    product_name: line.productName ?? null,
    ordered_quantity: line.orderedQuantity,
    received_quantity: line.receivedQuantity,
    unit_cost: line.unitCost,
    line_total: line.lineTotal ?? calculateLineTotal(line.orderedQuantity, line.unitCost),
    notes: line.notes ?? null,
  };
}

function normalizeSearchQuery(value: string | undefined): string | null {
  const normalizedValue = normalizeNullableText(value);

  return normalizedValue === null ? null : `%${normalizeSearchText(normalizedValue)}%`;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function encodePurchaseOrderListCursor(purchaseOrder: PurchaseOrderRecord | null): string | null {
  if (purchaseOrder === null) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      updated_at: purchaseOrder.updatedAt.toISOString(),
      id: purchaseOrder.id,
    }),
  ).toString('base64url');
}

function decodePurchaseOrderListCursor(value: string | undefined): PurchaseOrderListCursor | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isCursorPayload(decoded)) {
      return null;
    }

    const updatedAt = new Date(decoded.updated_at);

    if (Number.isNaN(updatedAt.getTime())) {
      return null;
    }

    return {
      updatedAt,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function isCursorPayload(
  value: unknown,
): value is { readonly updated_at: string; readonly id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'updated_at' in value &&
    typeof (value as { updated_at?: unknown }).updated_at === 'string' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function compareQuantities(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left);
  const rightUnits = parseQuantityUnits(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function calculateLineTotal(quantity: string, unitCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity);
  const unitCostCents = parseMoneyCents(unitCost);
  const totalCents = (quantityUnits * unitCostCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function sumMoneyAmounts(amounts: readonly string[]): string {
  const totalCents = amounts.reduce((total, amount) => total + parseMoneyCents(amount), 0n);

  return formatMoneyCents(totalCents);
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
