import {
  getAccessTokenOrRefresh,
  getAuthJsonEnvelope,
  postAuthJson,
} from '../auth/actions/login.action';
import { type ApiClientError, type ApiPaginationMeta } from '../../lib/api-envelope';

import { purchaseOrderListPageSize } from './purchase-order.defaults';
import type {
  PurchaseOrderDetail,
  PurchaseOrderLineItem,
  PurchaseOrderListFilters,
  PurchaseOrderListItem,
  PurchaseOrderListResult,
  PurchaseOrderReceiveInput,
  PurchaseOrderStatus,
  PurchaseOrderSummaryField,
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

export async function getPurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrderDetail> {
  const accessToken = await getAccessTokenOrRefresh();
  const envelope = await getAuthJsonEnvelope<unknown>(
    `/purchase-orders/${encodeURIComponent(purchaseOrderId)}`,
    {
      accessToken,
    },
  );

  return normalizePurchaseOrderDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

export async function receivePurchaseOrder({
  purchaseOrderId,
  input,
  idempotencyKey,
}: {
  readonly purchaseOrderId: string;
  readonly input: PurchaseOrderReceiveInput;
  readonly idempotencyKey: string;
}): Promise<void> {
  await postAuthJson<unknown>(
    `/purchase-orders/${encodeURIComponent(purchaseOrderId)}/receivings`,
    input,
    {
      idempotencyKey,
      requiresAuth: true,
    },
  );
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

export function normalizePurchaseOrderDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): PurchaseOrderDetail {
  const detail = normalizePurchaseOrderDetail(data);

  if (detail !== null) {
    return detail;
  }

  if (isObjectRecord(data)) {
    const candidates = [data.purchase_order, data.purchaseOrder, data.item, data.result];

    for (const candidate of candidates) {
      const nestedDetail = normalizePurchaseOrderDetail(candidate);

      if (nestedDetail !== null) {
        return nestedDetail;
      }
    }
  }

  throw toInvalidPurchaseOrderDetailResponseError(meta);
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

function normalizePurchaseOrderDetail(value: unknown): PurchaseOrderDetail | null {
  const purchaseOrder = normalizePurchaseOrderListItem(value);

  if (purchaseOrder === null || !isObjectRecord(value)) {
    return null;
  }

  return {
    ...purchaseOrder,
    lock_version: readLockVersion(value.lock_version),
    line_items: normalizePurchaseOrderLineItems(readPurchaseOrderLineItems(value)),
    receiving_status_summary: normalizeReceivingStatusSummary(
      value.receiving_status_summary ?? value.receivingStatusSummary ?? value.receiving_summary,
    ),
  };
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

function readPurchaseOrderLineItems(value: Record<string, unknown>): unknown {
  return value.line_items ?? value.purchase_order_lines ?? value.purchaseOrderLines ?? value.lines;
}

function normalizePurchaseOrderLineItems(value: unknown): readonly PurchaseOrderLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((lineItem, index) => normalizePurchaseOrderLineItem(lineItem, index))
    .filter((lineItem): lineItem is PurchaseOrderLineItem => lineItem !== null);
}

function normalizePurchaseOrderLineItem(
  value: unknown,
  index: number,
): PurchaseOrderLineItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const productSummary = readNestedSummary({
    value,
    nestedKey: 'product',
    idKey: 'product_id',
    nameKey: 'product_name',
    fallbackNameKey: 'name',
  });
  const id = readNullableString(value.id) ?? readNullableString(value.purchase_order_line_id);

  return {
    id: id ?? `line-${index}`,
    product_id: productSummary.id,
    product_name: productSummary.name,
    ordered_quantity: readNullableQuantityString(value.ordered_quantity),
    received_quantity: readNullableQuantityString(value.received_quantity),
    unit_cost: readNullableMoneyString(value.unit_cost),
    line_total: readNullableMoneyString(value.line_total),
    notes: readNullableString(value.notes),
  };
}

function normalizeReceivingStatusSummary(value: unknown): readonly PurchaseOrderSummaryField[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [{ label: 'Receiving status', value: readScalarDisplayString(value) }];
  }

  if (!isObjectRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([key, rawValue]) => ({
      label: formatFieldLabel(key),
      value: readScalarDisplayString(rawValue),
    }))
    .filter((field) => field.value !== null);
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

function toInvalidPurchaseOrderDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The purchase order response did not contain a valid purchase order payload.',
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

function readLockVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
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

function readNullableQuantityString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(3);
  }

  return null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readScalarDisplayString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return null;
}

function formatFieldLabel(value: string): string {
  return value
    .replaceAll('-', '_')
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
