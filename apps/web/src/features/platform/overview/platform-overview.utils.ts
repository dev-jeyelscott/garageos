import type { AuthSessionResponseData, AuthTenantStatus } from '../../auth/types/auth-session';
import { isApiClientError } from '../../../lib/api-envelope';

import type { PlatformTenantListItem } from '../tenants/platform-tenant.types';

import type {
  PlatformAttentionItem,
  PlatformOverviewPermissions,
  PlatformTenantStatusCounts,
} from './platform-overview.types';

export function getPlatformOverviewPermissions(
  session: AuthSessionResponseData,
): PlatformOverviewPermissions {
  return {
    canReadTenants: hasEffectivePermission(session, 'platform.tenants.read'),
    canCreateTenant: hasEffectivePermission(session, 'platform.tenants.create'),
    canReadAuditLogs: hasEffectivePermission(session, 'platform.audit_logs.read'),
    canStartSupportAccess: hasEffectivePermission(session, 'platform.support_access'),
    canManagePlans: hasEffectivePermission(session, 'platform.plans.update'),
  };
}

export function hasEffectivePermission(
  session: AuthSessionResponseData,
  permission: string,
): boolean {
  return session.effective_permissions.includes(permission);
}

export function createPlatformTenantStatusSummary(
  tenants: readonly PlatformTenantListItem[],
): PlatformTenantStatusCounts {
  return tenants.reduce<PlatformTenantStatusCounts>(
    (summary, tenant) => ({
      ...summary,
      [tenant.status]: summary[tenant.status] + 1,
    }),
    {
      pending_setup: 0,
      active: 0,
      grace_period: 0,
      read_only: 0,
      suspended: 0,
      pending_deletion: 0,
      deleted: 0,
    },
  );
}

export function createPlatformAttentionItems(
  tenants: readonly PlatformTenantListItem[],
): readonly PlatformAttentionItem[] {
  const actionableStatuses = new Set<AuthTenantStatus>([
    'pending_setup',
    'grace_period',
    'read_only',
    'suspended',
    'pending_deletion',
  ]);

  return tenants
    .filter((tenant) => actionableStatuses.has(tenant.status))
    .map((tenant) => ({
      tenant,
      issue: getPlatformTenantIssue(tenant),
      recommendedAction: getPlatformTenantRecommendedAction(tenant),
    }));
}

export function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  return fallback;
}

export function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const requestId = error.requestId === null ? 'N/A' : error.requestId;
  const correlationId = error.correlationId === null ? 'N/A' : error.correlationId;

  return `Code: ${error.code}. Request: ${requestId}. Correlation: ${correlationId}.`;
}

function getPlatformTenantIssue(tenant: PlatformTenantListItem): string {
  switch (tenant.status) {
    case 'pending_setup':
      return 'Setup is not finished.';
    case 'grace_period':
      return 'Subscription is in grace period.';
    case 'read_only':
      return 'Operational writes are blocked.';
    case 'suspended':
      return 'Tenant access is suspended.';
    case 'pending_deletion':
      return 'Tenant is in the deletion window.';
    case 'active':
      return 'No action needed.';
    case 'deleted':
      return 'Tenant has been deleted.';
  }
}

function getPlatformTenantRecommendedAction(tenant: PlatformTenantListItem): string {
  switch (tenant.status) {
    case 'pending_setup':
      return 'Review onboarding blockers.';
    case 'grace_period':
      return 'Confirm external renewal payment and update subscription if approved.';
    case 'read_only':
      return 'Review subscription status or active platform override.';
    case 'suspended':
      return 'Contact tenant owner or review renewal/export access.';
    case 'pending_deletion':
      return 'Review deletion timing and emergency-extension eligibility.';
    case 'active':
      return 'No action needed.';
    case 'deleted':
      return 'No tenant operational access is available.';
  }
}
