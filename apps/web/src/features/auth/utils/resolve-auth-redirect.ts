import type { AuthSessionResponseData, AuthTenantStatus } from '../types/auth-session';

const TENANT_OPERATIONAL_STATUSES = new Set<AuthTenantStatus>([
  'active',
  'grace_period',
  'read_only',
]);

const TENANT_BLOCKED_STATUSES = new Set<AuthTenantStatus>([
  'suspended',
  'pending_deletion',
  'deleted',
]);

export function resolveAuthenticatedRedirect(session: AuthSessionResponseData): string {
  if (!session.user.email_verified) {
    return '/auth/email-verification';
  }

  if (session.user.user_type === 'platform_admin') {
    return '/platform/tenants';
  }

  const tenantStatus = session.tenant?.status;

  if (tenantStatus === 'pending_setup') {
    return '/onboarding';
  }

  if (tenantStatus !== undefined && TENANT_OPERATIONAL_STATUSES.has(tenantStatus)) {
    return '/dashboard';
  }

  return '/account/status';
}

export function isTenantOperationalStatus(status: AuthTenantStatus | undefined): boolean {
  return status !== undefined && TENANT_OPERATIONAL_STATUSES.has(status);
}

export function isTenantBlockedStatus(status: AuthTenantStatus | undefined): boolean {
  return status !== undefined && TENANT_BLOCKED_STATUSES.has(status);
}
