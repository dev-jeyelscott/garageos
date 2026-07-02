import {
  getAccessTokenOrRefresh,
  getAuthJsonEnvelope,
  postAuthJson,
} from '../auth/actions/login.action';
import {
  readApiResponse,
  type ApiClientError,
  type ApiPaginationMeta,
} from '../../lib/api-envelope';

import { supplierReturnListPageSize } from './supplier-return.defaults';
import type {
  SupplierReturnDetail,
  SupplierReturnInput,
  SupplierReturnLineItem,
  SupplierReturnListFilters,
  SupplierReturnListItem,
  SupplierReturnListResult,
  SupplierReturnStatus,
  SupplierReturnUpdateInput,
} from './supplier-return.types';

export async function getSupplierReturns({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: SupplierReturnListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<SupplierReturnListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (filters.branch_id !== 'all' && filters.branch_id.length > 0) {
    params.set('branch_id', filters.branch_id);
  }

  if (filters.supplier_id !== 'all' && filters.supplier_id.length > 0) {
    params.set('supplier_id', filters.supplier_id);
  }

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<unknown>(`/supplier-returns?${params.toString()}`, {
    accessToken,
  });

  return normalizeSupplierReturnListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizeSupplierReturnPagination(envelope.meta.pagination),
  });
}

export async function getSupplierReturn(supplierReturnId: string): Promise<SupplierReturnDetail> {
  const accessToken = await getAccessTokenOrRefresh();
  const envelope = await getAuthJsonEnvelope<unknown>(
    `/supplier-returns/${encodeURIComponent(supplierReturnId)}`,
    {
      accessToken,
    },
  );

  return normalizeSupplierReturnDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

export async function createSupplierReturn({
  input,
  idempotencyKey,
}: {
  readonly input: SupplierReturnInput;
  readonly idempotencyKey: string;
}): Promise<SupplierReturnDetail> {
  const data = await postAuthJson<unknown>('/supplier-returns', input, {
    requiresAuth: true,
    idempotencyKey,
  });

  return normalizeSupplierReturnDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function updateSupplierReturn({
  supplierReturnId,
  input,
}: {
  readonly supplierReturnId: string;
  readonly input: SupplierReturnUpdateInput;
}): Promise<SupplierReturnDetail> {
  const data = await sendSupplierReturnJson<unknown>({
    method: 'PATCH',
    path: `/supplier-returns/${encodeURIComponent(supplierReturnId)}`,
    body: input,
  });

  return normalizeSupplierReturnDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function postSupplierReturn({
  supplierReturnId,
  idempotencyKey,
}: {
  readonly supplierReturnId: string;
  readonly idempotencyKey: string;
}): Promise<SupplierReturnDetail> {
  const data = await postAuthJson<unknown>(
    `/supplier-returns/${encodeURIComponent(supplierReturnId)}/post`,
    {},
    {
      requiresAuth: true,
      idempotencyKey,
    },
  );

  return normalizeSupplierReturnDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function cancelSupplierReturn({
  supplierReturnId,
  idempotencyKey,
}: {
  readonly supplierReturnId: string;
  readonly idempotencyKey: string;
}): Promise<SupplierReturnDetail> {
  const data = await postAuthJson<unknown>(
    `/supplier-returns/${encodeURIComponent(supplierReturnId)}/cancel`,
    {},
    {
      requiresAuth: true,
      idempotencyKey,
    },
  );

  return normalizeSupplierReturnDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export function createSupplierReturnCreateIdempotencyKey(): string {
  return createIdempotencyKey('supplier-return-create');
}

export function createSupplierReturnPostIdempotencyKey(): string {
  return createIdempotencyKey('supplier-return-post');
}

export function createSupplierReturnCancelIdempotencyKey(): string {
  return createIdempotencyKey('supplier-return-cancel');
}

export function normalizeSupplierReturnListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: ApiPaginationMeta | null;
  },
): SupplierReturnListResult {
  if (Array.isArray(data)) {
    const supplierReturns = normalizeSupplierReturnArray(data);

    if (supplierReturns !== null) {
      return {
        supplierReturns,
        pagination: meta.pagination,
      };
    }
  }

  if (isObjectRecord(data)) {
    const supplierReturnPayload = readSupplierReturnArray(data);

    if (supplierReturnPayload !== null) {
      return {
        supplierReturns: supplierReturnPayload,
        pagination: normalizeSupplierReturnPagination(data.pagination) ?? meta.pagination,
      };
    }
  }

  throw toInvalidSupplierReturnListResponseError(meta);
}

export function normalizeSupplierReturnDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): SupplierReturnDetail {
  const detail = normalizeSupplierReturnDetail(data);

  if (detail !== null) {
    return detail;
  }

  if (isObjectRecord(data)) {
    const candidates = [
      data.supplier_return,
      data.supplierReturn,
      data.return,
      data.item,
      data.result,
    ];

    for (const candidate of candidates) {
      const nestedDetail = normalizeSupplierReturnDetail(candidate);

      if (nestedDetail !== null) {
        return nestedDetail;
      }
    }
  }

  throw toInvalidSupplierReturnDetailResponseError(meta);
}

function readSupplierReturnArray(
  data: Record<string, unknown>,
): readonly SupplierReturnListItem[] | null {
  const candidates = [
    data.supplier_returns,
    data.supplierReturns,
    data.returns,
    data.items,
    data.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const supplierReturns = normalizeSupplierReturnArray(candidate);

      if (supplierReturns !== null) {
        return supplierReturns;
      }
    }
  }

  return null;
}

function normalizeSupplierReturnArray(
  values: readonly unknown[],
): readonly SupplierReturnListItem[] | null {
  const supplierReturns: SupplierReturnListItem[] = [];

  for (const value of values) {
    const supplierReturn = normalizeSupplierReturnListItem(value);

    if (supplierReturn === null) {
      return null;
    }

    supplierReturns.push(supplierReturn);
  }

  return supplierReturns;
}

function normalizeSupplierReturnDetail(value: unknown): SupplierReturnDetail | null {
  const supplierReturn = normalizeSupplierReturnListItem(value);

  if (supplierReturn === null || !isObjectRecord(value)) {
    return null;
  }

  return {
    ...supplierReturn,
    lock_version: readLockVersion(value.lock_version),
    line_items: normalizeSupplierReturnLineItems(readSupplierReturnLineItems(value)),
  };
}

function normalizeSupplierReturnListItem(value: unknown): SupplierReturnListItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (!(typeof value.id === 'string' && isSupplierReturnStatus(value.status))) {
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
    supplier_return_number:
      readNullableString(value.supplier_return_number) ?? readNullableString(value.return_number),
    status: value.status,
    branch_id: branchSummary.id,
    branch_name: branchSummary.name,
    supplier_id: supplierSummary.id,
    supplier_name: supplierSummary.name,
    original_receiving_id: readNullableString(value.original_receiving_id),
    reason: readNullableString(value.reason),
    total_returned_quantity:
      readNullableQuantityString(value.total_returned_quantity) ??
      readNullableQuantityString(value.returned_quantity),
    inventory_value:
      readNullableMoneyString(value.inventory_value) ??
      readNullableMoneyString(value.total_inventory_value),
    financial_value:
      readNullableMoneyString(value.financial_value) ??
      readNullableMoneyString(value.total_financial_value) ??
      readNullableMoneyString(value.return_value),
    ap_reduction_amount: readNullableMoneyString(value.ap_reduction_amount),
    supplier_credit_amount: readNullableMoneyString(value.supplier_credit_amount),
    created_at: readNullableString(value.created_at),
    updated_at: readNullableString(value.updated_at),
    posted_at: readNullableString(value.posted_at),
    cancelled_at: readNullableString(value.cancelled_at),
  };
}

function readSupplierReturnLineItems(value: Record<string, unknown>): unknown {
  return (
    value.line_items ?? value.supplier_return_lines ?? value.supplierReturnLines ?? value.lines
  );
}

function normalizeSupplierReturnLineItems(value: unknown): readonly SupplierReturnLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((lineItem, index) => normalizeSupplierReturnLineItem(lineItem, index))
    .filter((lineItem): lineItem is SupplierReturnLineItem => lineItem !== null);
}

function normalizeSupplierReturnLineItem(
  value: unknown,
  index: number,
): SupplierReturnLineItem | null {
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
  const id = readNullableString(value.id) ?? readNullableString(value.supplier_return_line_id);

  return {
    id: id ?? `line-${index}`,
    product_id: productSummary.id,
    product_name: productSummary.name,
    returned_quantity: readNullableQuantityString(value.returned_quantity),
    inventory_value: readNullableMoneyString(value.inventory_value),
    financial_value: readNullableMoneyString(value.financial_value),
  };
}

function normalizeSupplierReturnPagination(pagination: unknown): ApiPaginationMeta | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : supplierReturnListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : supplierReturnListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
  };
}

function toInvalidSupplierReturnListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message:
      'The supplier return list response did not contain a valid supplier return list payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidSupplierReturnDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The supplier return response did not contain a valid supplier return payload.',
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

function isSupplierReturnStatus(value: unknown): value is SupplierReturnStatus {
  return value === 'draft' || value === 'posted' || value === 'cancelled';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

async function sendSupplierReturnJson<TData>({
  method,
  path,
  body,
}: {
  readonly method: 'PATCH';
  readonly path: string;
  readonly body: unknown;
}): Promise<TData> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${await getAccessTokenOrRefresh()}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readApiResponse<TData>(response);
}

function buildApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_GARAGEOS_API_BASE_URL ?? '/api/v1';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function createIdempotencyKey(prefix: string): string {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  return `${prefix}-${randomValue}`;
}
