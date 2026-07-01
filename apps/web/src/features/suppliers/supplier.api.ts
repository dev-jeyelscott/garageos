import { getAccessTokenOrRefresh, getAuthJsonEnvelope } from '../auth/actions/login.action';
import type { ApiClientError, ApiPaginationMeta } from '../../lib/api-envelope';

import { supplierListPageSize } from './supplier.defaults';
import type {
  SupplierListFilters,
  SupplierListItem,
  SupplierListResult,
  SupplierStatus,
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
