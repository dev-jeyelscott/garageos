import { getAccessTokenOrRefresh, getAuthJsonEnvelope } from '../auth/actions/login.action';
import { type ApiClientError, type ApiPaginationMeta } from '../../lib/api-envelope';

import { purchaseOrderListPageSize } from './purchase-order.defaults';
import type {
  PurchaseOrderListFilters,
  PurchaseOrderListItem,
  PurchaseOrderListResult,
  PurchaseOrderStatus,
  PurchasePaymentTerms,
} from './purchase-order.types';

export async function getPurchaseOrders({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: PurchaseOrderListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<PurchaseOrderListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  if (filters.q.length > 0) {
    params.set('q', filters.q);
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (filters.branch_id !== 'all' && filters.branch_id.length > 0) {
    params.set('branch_id', filters.branch_id);
  }

  if (filters.from_date.length > 0) {
    params.set('from_date', filters.from_date);
  }

  if (filters.to_date.length > 0) {
    params.set('to_date', filters.to_date);
  }

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<unknown>(`/purchase-orders?${params.toString()}`, {
    accessToken,
  });

  return normalizePurchaseOrderListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizePurchaseOrderPagination(envelope.meta.pagination),
  });
}

export function normalizePurchaseOrderListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: ApiPaginationMeta | null;
  },
): PurchaseOrderListResult {
  if (Array.isArray(data)) {
    const purchaseOrders = normalizePurchaseOrderArray(data);

    if (purchaseOrders !== null) {
      return {
        purchaseOrders,
        pagination: meta.pagination,
      };
    }
  }

  if (isObjectRecord(data)) {
    const purchaseOrderPayload = readPurchaseOrderArray(data);

    if (purchaseOrderPayload !== null) {
      return {
        purchaseOrders: purchaseOrderPayload,
        pagination: normalizePurchaseOrderPagination(data.pagination) ?? meta.pagination,
      };
    }
  }

  throw toInvalidPurchaseOrderListResponseError(meta);
}

function readPurchaseOrderArray(
  data: Record<string, unknown>,
): readonly PurchaseOrderListItem[] | null {
  const candidates = [data.purchase_orders, data.purchaseOrders, data.items, data.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const purchaseOrders = normalizePurchaseOrderArray(candidate);

      if (purchaseOrders !== null) {
        return purchaseOrders;
      }
    }
  }

  return null;
}

function normalizePurchaseOrderArray(
  values: readonly unknown[],
): readonly PurchaseOrderListItem[] | null {
  const purchaseOrders: PurchaseOrderListItem[] = [];

  for (const value of values) {
    const purchaseOrder = normalizePurchaseOrderListItem(value);

    if (purchaseOrder === null) {
      return null;
    }

    purchaseOrders.push(purchaseOrder);
  }

  return purchaseOrders;
}

function normalizePurchaseOrderListItem(value: unknown): PurchaseOrderListItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.purchase_order_number === 'string' &&
      isPurchaseOrderStatus(value.status) &&
      isPurchasePaymentTerms(value.payment_terms) &&
      typeof value.order_date === 'string'
    )
  ) {
    return null;
  }

  const branchSummary = readNestedSummary({
    value,
    nestedKey: 'branch',
    idKey: 'branch_id',
    nameKey: 'branch_name',
    fallbackNameKey: 'name',
  });
  const supplierSummary = readNestedSummary({
    value,
    nestedKey: 'supplier',
    idKey: 'supplier_id',
    nameKey: 'supplier_name',
    fallbackNameKey: 'name',
  });

  return {
    id: value.id,
    purchase_order_number: value.purchase_order_number,
    status: value.status,
    payment_terms: value.payment_terms,
    branch_id: branchSummary.id,
    branch_name: branchSummary.name,
    supplier_id: supplierSummary.id,
    supplier_name: supplierSummary.name,
    order_date: value.order_date,
    expected_receive_date: readNullableString(value.expected_receive_date),
    ordered_total_amount:
      readNullableMoneyString(value.ordered_total_amount) ??
      readNullableMoneyString(value.total_amount) ??
      readNullableMoneyString(value.purchase_total_amount),
    received_total_amount: readNullableMoneyString(value.received_total_amount),
    ordered_line_count:
      readNullableInteger(value.ordered_line_count) ?? readNullableInteger(value.line_count),
    received_line_count: readNullableInteger(value.received_line_count),
    created_at: readNullableString(value.created_at),
    updated_at: readNullableString(value.updated_at),
  };
}

function normalizePurchaseOrderPagination(pagination: unknown): ApiPaginationMeta | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : purchaseOrderListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : purchaseOrderListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
  };
}

function toInvalidPurchaseOrderListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message:
      'The purchase order list response did not contain a valid purchase order list payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function readNestedSummary({
  value,
  nestedKey,
  idKey,
  nameKey,
  fallbackNameKey,
}: {
  readonly value: Record<string, unknown>;
  readonly nestedKey: string;
  readonly idKey: string;
  readonly nameKey: string;
  readonly fallbackNameKey: string;
}): { readonly id: string | null; readonly name: string | null } {
  const nestedValue = value[nestedKey];

  if (isObjectRecord(nestedValue)) {
    return {
      id: readNullableString(nestedValue.id) ?? readNullableString(value[idKey]),
      name:
        readNullableString(nestedValue[nameKey]) ??
        readNullableString(nestedValue[fallbackNameKey]) ??
        readNullableString(value[nameKey]),
    };
  }

  return {
    id: readNullableString(value[idKey]),
    name: readNullableString(value[nameKey]),
  };
}

function readNullableInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function readNullableMoneyString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  return null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isPurchaseOrderStatus(value: unknown): value is PurchaseOrderStatus {
  return (
    value === 'draft' ||
    value === 'ordered' ||
    value === 'partially_received' ||
    value === 'received' ||
    value === 'closed' ||
    value === 'cancelled'
  );
}

function isPurchasePaymentTerms(value: unknown): value is PurchasePaymentTerms {
  return value === 'cash' || value === 'credit';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}
