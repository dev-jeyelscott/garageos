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

import { supplierListPageSize } from './supplier.defaults';
import type {
  SupplierDetail,
  SupplierListFilters,
  SupplierListItem,
  SupplierListResult,
  SupplierMutationInput,
  SupplierStatus,
  SupplierUpdateInput,
} from './supplier.types';

export async function getSuppliers({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: SupplierListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<SupplierListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  if (filters.q.length > 0) {
    params.set('q', filters.q);
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<unknown>(`/suppliers?${params.toString()}`, {
    accessToken,
  });

  return normalizeSupplierListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizeSupplierPagination(envelope.meta.pagination),
  });
}

export async function getSupplier(supplierId: string): Promise<SupplierDetail> {
  const accessToken = await getAccessTokenOrRefresh();
  const envelope = await getAuthJsonEnvelope<unknown>(
    `/suppliers/${encodeURIComponent(supplierId)}`,
    {
      accessToken,
    },
  );

  return normalizeSupplierDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

export async function createSupplier(input: SupplierMutationInput): Promise<SupplierDetail> {
  const data = await postAuthJson<unknown>('/suppliers', input, {
    requiresAuth: true,
    idempotencyKey: createIdempotencyKey('supplier-create'),
  });

  return normalizeSupplierDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function updateSupplier(
  supplierId: string,
  input: SupplierUpdateInput,
): Promise<SupplierDetail> {
  const data = await sendSupplierJson<unknown>({
    method: 'PATCH',
    path: `/suppliers/${encodeURIComponent(supplierId)}`,
    body: input,
  });

  return normalizeSupplierDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function deactivateSupplier(supplierId: string): Promise<SupplierDetail> {
  const data = await postAuthJson<unknown>(
    `/suppliers/${encodeURIComponent(supplierId)}/deactivate`,
    {},
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('supplier-deactivate'),
    },
  );

  return normalizeSupplierDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export async function reactivateSupplier(supplierId: string): Promise<SupplierDetail> {
  const data = await postAuthJson<unknown>(
    `/suppliers/${encodeURIComponent(supplierId)}/reactivate`,
    {},
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('supplier-reactivate'),
    },
  );

  return normalizeSupplierDetailPayload(data, {
    requestId: null,
    correlationId: null,
  });
}

export function normalizeSupplierListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: ApiPaginationMeta | null;
  },
): SupplierListResult {
  if (Array.isArray(data)) {
    const suppliers = normalizeSupplierArray(data);

    if (suppliers !== null) {
      return {
        suppliers,
        pagination: meta.pagination,
      };
    }
  }

  if (isObjectRecord(data)) {
    const supplierPayload = readSupplierArray(data);

    if (supplierPayload !== null) {
      return {
        suppliers: supplierPayload,
        pagination: normalizeSupplierPagination(data.pagination) ?? meta.pagination,
      };
    }
  }

  throw toInvalidSupplierListResponseError(meta);
}

function normalizeSupplierDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): SupplierDetail {
  const detail = normalizeSupplierDetail(data);

  if (detail !== null) {
    return detail;
  }

  if (isObjectRecord(data)) {
    const candidates = [data.supplier, data.item, data.result];

    for (const candidate of candidates) {
      const nestedDetail = normalizeSupplierDetail(candidate);

      if (nestedDetail !== null) {
        return nestedDetail;
      }
    }
  }

  throw toInvalidSupplierDetailResponseError(meta);
}

function readSupplierArray(data: Record<string, unknown>): readonly SupplierListItem[] | null {
  const candidates = [data.suppliers, data.items, data.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const suppliers = normalizeSupplierArray(candidate);

      if (suppliers !== null) {
        return suppliers;
      }
    }
  }

  return null;
}

function normalizeSupplierArray(values: readonly unknown[]): readonly SupplierListItem[] | null {
  const suppliers: SupplierListItem[] = [];

  for (const value of values) {
    const supplier = normalizeSupplierListItem(value);

    if (supplier === null) {
      return null;
    }

    suppliers.push(supplier);
  }

  return suppliers;
}

function normalizeSupplierPagination(pagination: unknown): ApiPaginationMeta | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : supplierListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : supplierListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
  };
}

function toInvalidSupplierListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The supplier list response did not contain a valid supplier list payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidSupplierDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The supplier response did not contain a valid supplier payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function normalizeSupplierDetail(value: unknown): SupplierDetail | null {
  const supplier = normalizeSupplierListItem(value);

  if (supplier === null || !isObjectRecord(value)) {
    return null;
  }

  return {
    ...supplier,
    lock_version: readLockVersion(value.lock_version),
  };
}

function normalizeSupplierListItem(value: unknown): SupplierListItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      isSupplierStatus(value.status)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    status: value.status,
    contact_person: readNullableString(value.contact_person),
    mobile_number: readNullableString(value.mobile_number),
    email: readNullableString(value.email),
    address: readNullableString(value.address),
    notes: readNullableString(value.notes),
    created_at: readNullableString(value.created_at),
    updated_at: readNullableString(value.updated_at),
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

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isSupplierStatus(value: unknown): value is SupplierStatus {
  return value === 'active' || value === 'inactive';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

async function sendSupplierJson<TData>({
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
