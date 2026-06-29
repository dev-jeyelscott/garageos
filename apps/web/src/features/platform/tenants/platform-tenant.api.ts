import {
  getAccessTokenOrRefresh,
  getAuthJsonEnvelope,
  postAuthJson,
} from '../../auth/actions/login.action';
import type { AuthTenantStatus } from '../../auth/types/auth-session';
import type { ApiClientError } from '../../../lib/api-envelope';

import { platformTenantListPageSize } from './platform-tenant.defaults';
import type {
  ApplyPlatformTenantReadOnlyOverrideResponse,
  ApplyPlatformTenantSuspensionResponse,
  CreatePlatformTenantResponse,
  EndPlatformSupportAccessSessionResponse,
  PlatformSupportAccessEndForm,
  PlatformSupportAccessForm,
  PlatformTenantCreateForm,
  PlatformTenantDeletionJobForm,
  PlatformTenantDetail,
  PlatformTenantExportForm,
  PlatformTenantListFilters,
  PlatformTenantListItem,
  PlatformTenantListPagination,
  PlatformTenantListResult,
  PlatformTenantReadOnlyOverrideForm,
  PlatformTenantSubscriptionForm,
  PlatformTenantSuspensionForm,
  QueuePlatformTenantDeletionJobResponse,
  QueuePlatformTenantExportResponse,
  StartPlatformSupportAccessSessionResponse,
  UpdatePlatformTenantSubscriptionResponse,
} from './platform-tenant.types';

export async function getPlatformTenants({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: PlatformTenantListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<PlatformTenantListResult> {
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

  const envelope = await getAuthJsonEnvelope<unknown>(`/platform/tenants?${params.toString()}`, {
    accessToken,
  });

  return normalizePlatformTenantListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizePlatformTenantPagination(envelope.meta.pagination),
  });
}

export async function getPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetail> {
  const accessToken = await getAccessTokenOrRefresh();

  const envelope = await getAuthJsonEnvelope<unknown>(
    `/platform/tenants/${encodeURIComponent(tenantId)}`,
    {
      accessToken,
    },
  );

  return normalizePlatformTenantDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

export async function createPlatformTenant(
  form: PlatformTenantCreateForm,
): Promise<CreatePlatformTenantResponse> {
  const duplicateApprovalReason = form.duplicate_approval_reason.trim();

  return postAuthJson<CreatePlatformTenantResponse>(
    '/platform/tenants',
    {
      business_name: form.business_name.trim(),
      shop_email: form.shop_email.trim(),
      plan_id: form.plan_id.trim(),
      subscription_start_date: form.subscription_start_date,
      subscription_expiration_date: form.subscription_expiration_date,
      owner: {
        full_name: form.owner_full_name.trim(),
        email: form.owner_email.trim(),
        send_invitation: true,
      },
      ...(form.approve_duplicate
        ? {
            approve_duplicate: true,
            duplicate_approval_reason: duplicateApprovalReason,
          }
        : {}),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-create'),
    },
  );
}

export async function updatePlatformTenantSubscription(
  tenantId: string,
  form: PlatformTenantSubscriptionForm,
): Promise<UpdatePlatformTenantSubscriptionResponse> {
  return postAuthJson<UpdatePlatformTenantSubscriptionResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/subscription`,
    {
      plan_id: form.plan_id.trim(),
      subscription_start_date: form.subscription_start_date,
      subscription_expiration_date: form.subscription_expiration_date,
      reason: form.reason.trim(),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-subscription-update'),
    },
  );
}

export async function applyPlatformTenantReadOnlyOverride(
  tenantId: string,
  form: PlatformTenantReadOnlyOverrideForm,
): Promise<ApplyPlatformTenantReadOnlyOverrideResponse> {
  const expiresAt = toOptionalIsoTimestamp(form.expires_at);

  return postAuthJson<ApplyPlatformTenantReadOnlyOverrideResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/read-only`,
    {
      reason: form.reason.trim(),
      ...(expiresAt === null
        ? {}
        : {
            expires_at: expiresAt,
          }),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-read-only-override'),
    },
  );
}

export async function applyPlatformTenantSuspension(
  tenantId: string,
  form: PlatformTenantSuspensionForm,
): Promise<ApplyPlatformTenantSuspensionResponse> {
  const expiresAt = toOptionalIsoTimestamp(form.expires_at);

  return postAuthJson<ApplyPlatformTenantSuspensionResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/suspend`,
    {
      reason: form.reason.trim(),
      ...(expiresAt === null
        ? {}
        : {
            expires_at: expiresAt,
          }),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-suspension'),
    },
  );
}

export async function startPlatformSupportAccessSession(
  tenantId: string,
  form: PlatformSupportAccessForm,
): Promise<StartPlatformSupportAccessSessionResponse> {
  const expiresAt = toOptionalIsoTimestamp(form.expires_at);

  return postAuthJson<StartPlatformSupportAccessSessionResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/support-access-sessions`,
    {
      mode: form.mode,
      reason: form.reason.trim(),
      expires_at: expiresAt ?? '',
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-support-access-session'),
    },
  );
}

export async function endPlatformSupportAccessSession(
  supportAccessSessionId: string,
  form: PlatformSupportAccessEndForm,
): Promise<EndPlatformSupportAccessSessionResponse> {
  return postAuthJson<EndPlatformSupportAccessSessionResponse>(
    `/platform/support-access-sessions/${encodeURIComponent(supportAccessSessionId)}/end`,
    {
      reason: form.reason.trim(),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-support-access-session-end'),
    },
  );
}

export async function queuePlatformTenantExport(
  tenantId: string,
  form: PlatformTenantExportForm,
): Promise<QueuePlatformTenantExportResponse> {
  return postAuthJson<QueuePlatformTenantExportResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/exports`,
    {
      reason: form.reason.trim(),
      include_attachments: form.include_attachments,
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-export'),
    },
  );
}

export async function queuePlatformTenantDeletionJob(
  tenantId: string,
  form: PlatformTenantDeletionJobForm,
): Promise<QueuePlatformTenantDeletionJobResponse> {
  return postAuthJson<QueuePlatformTenantDeletionJobResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/deletion-jobs`,
    {
      reason: form.reason.trim(),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-deletion-job'),
    },
  );
}

export function normalizePlatformTenantListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: PlatformTenantListPagination | null;
  },
): PlatformTenantListResult {
  if (Array.isArray(data) && data.every(isPlatformTenantListItem)) {
    return {
      tenants: data,
      pagination: meta.pagination,
    };
  }

  if (
    isObjectRecord(data) &&
    Array.isArray(data.tenants) &&
    data.tenants.every(isPlatformTenantListItem)
  ) {
    return {
      tenants: data.tenants,
      pagination: normalizePlatformTenantPagination(data.pagination) ?? meta.pagination,
    };
  }

  throw toInvalidTenantListResponseError(meta);
}

export function normalizePlatformTenantDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): PlatformTenantDetail {
  if (isPlatformTenantDetail(data)) {
    return data;
  }

  if (isObjectRecord(data) && isPlatformTenantDetail(data.tenant)) {
    return data.tenant;
  }

  throw toInvalidTenantDetailResponseError(meta);
}

function normalizePlatformTenantPagination(
  pagination: unknown,
): PlatformTenantListPagination | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : platformTenantListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : platformTenantListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
  };
}

function toInvalidTenantListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The platform tenant list response did not contain a valid tenant list payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidTenantDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The platform tenant detail response did not contain a tenant detail payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function isPlatformTenantDetail(value: unknown): value is PlatformTenantDetail {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.business_name === 'string' &&
    isTenantStatus(value.status)
  );
}

function isPlatformTenantListItem(value: unknown): value is PlatformTenantListItem {
  return isPlatformTenantDetail(value);
}

function isTenantStatus(value: unknown): value is AuthTenantStatus {
  return (
    value === 'pending_setup' ||
    value === 'active' ||
    value === 'grace_period' ||
    value === 'read_only' ||
    value === 'suspended' ||
    value === 'pending_deletion' ||
    value === 'deleted'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

function createIdempotencyKey(prefix: string): string {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomId}`;
}

function toOptionalIsoTimestamp(value: string): string | null {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  return new Date(normalizedValue).toISOString();
}
