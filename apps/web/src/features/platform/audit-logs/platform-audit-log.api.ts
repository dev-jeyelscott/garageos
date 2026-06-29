import { getAccessTokenOrRefresh, getAuthJsonEnvelope } from '../../auth/actions/login.action';
import type { ApiClientError } from '../../../lib/api-envelope';

import type {
  PlatformAuditLogListFilters,
  PlatformAuditLogListItem,
  PlatformAuditLogListPagination,
  PlatformAuditLogListResult,
} from './platform-audit-log.types';

export async function getPlatformAuditLogs({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: PlatformAuditLogListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<PlatformAuditLogListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  if (filters.platform_admin_user_id.length > 0) {
    params.set('platform_admin_user_id', filters.platform_admin_user_id);
  }

  if (filters.action.length > 0) {
    params.set('action', filters.action);
  }

  if (filters.tenant_id.length > 0) {
    params.set('tenant_id', filters.tenant_id);
  }

  if (filters.from.length > 0) {
    params.set('from', new Date(filters.from).toISOString());
  }

  if (filters.to.length > 0) {
    params.set('to', new Date(filters.to).toISOString());
  }

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<unknown>(`/platform/audit-logs?${params.toString()}`, {
    accessToken,
  });

  return normalizePlatformAuditLogListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizePlatformAuditLogPagination(envelope.meta.pagination),
  });
}

export function normalizePlatformAuditLogListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: PlatformAuditLogListPagination | null;
  },
): PlatformAuditLogListResult {
  if (
    isObjectRecord(data) &&
    Array.isArray(data.audit_logs) &&
    data.audit_logs.every(isPlatformAuditLogListItem)
  ) {
    return {
      audit_logs: data.audit_logs,
      pagination: normalizePlatformAuditLogPagination(data.pagination) ?? meta.pagination,
    };
  }

  throw toInvalidAuditLogListResponseError(meta);
}

export function normalizePlatformAuditLogPagination(
  value: unknown,
): PlatformAuditLogListPagination | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const limit = typeof value.limit === 'number' ? value.limit : null;
  const nextCursor =
    typeof value.next_cursor === 'string' || value.next_cursor === null ? value.next_cursor : null;
  const hasMore = typeof value.has_more === 'boolean' ? value.has_more : null;

  if (limit === null || hasMore === null) {
    return null;
  }

  return {
    limit,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

function isPlatformAuditLogListItem(value: unknown): value is PlatformAuditLogListItem {
  return (
    isObjectRecord(value) &&
    typeof value.id === 'string' &&
    (typeof value.platform_admin_user_id === 'string' || value.platform_admin_user_id === null) &&
    (typeof value.tenant_id === 'string' || value.tenant_id === null) &&
    typeof value.action === 'string' &&
    typeof value.entity_type === 'string' &&
    (typeof value.entity_id === 'string' || value.entity_id === null) &&
    (isObjectRecord(value.metadata_json) || value.metadata_json === null) &&
    (typeof value.ip_address === 'string' || value.ip_address === null) &&
    (typeof value.user_agent === 'string' || value.user_agent === null) &&
    typeof value.created_at === 'string'
  );
}

function toInvalidAuditLogListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_response',
    message: 'The platform audit log response was not valid.',
    status: 200,
    requestId,
    correlationId,
    details: [],
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}
