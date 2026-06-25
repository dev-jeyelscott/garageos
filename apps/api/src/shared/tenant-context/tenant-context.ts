import { GarageOsApiException } from '../api/api-exception';

export const API_TENANT_CONTEXT_RESOLVER = Symbol('API_TENANT_CONTEXT_RESOLVER');

export const TENANT_CONTEXT_USER_TYPES = {
  TENANT_USER: 'tenant_user',
  PLATFORM_ADMIN: 'platform_admin',
} as const;

export type TenantContextUserType =
  (typeof TENANT_CONTEXT_USER_TYPES)[keyof typeof TENANT_CONTEXT_USER_TYPES];

export const TENANT_STATUSES = {
  PENDING_SETUP: 'pending_setup',
  ACTIVE: 'active',
  GRACE_PERIOD: 'grace_period',
  READ_ONLY: 'read_only',
  SUSPENDED: 'suspended',
  PENDING_DELETION: 'pending_deletion',
  DELETED: 'deleted',
} as const;

export type TenantStatus = (typeof TENANT_STATUSES)[keyof typeof TENANT_STATUSES];

export const SUBSCRIPTION_STATUS_SOURCES = {
  SYSTEM_COMPUTED: 'system_computed',
  PLATFORM_OVERRIDE: 'platform_override',
} as const;

export type SubscriptionStatusSource =
  (typeof SUBSCRIPTION_STATUS_SOURCES)[keyof typeof SUBSCRIPTION_STATUS_SOURCES];

export interface TenantContextAuthenticatedActor {
  readonly user_id: string;
  readonly user_type: TenantContextUserType;
  readonly tenant_id: string | null;
  readonly session_id: string;
  readonly email_verified: boolean;
  readonly support_access_session_id: string | null;
}

export interface TenantContextAuthenticatedTenant {
  readonly id: string;
  readonly status: TenantStatus;
}

export interface TenantContextAuthenticatedBranch {
  readonly id: string;
}

export interface TenantContextAuthenticatedSession {
  readonly actor: TenantContextAuthenticatedActor;
  readonly tenant: TenantContextAuthenticatedTenant | null;
  readonly effective_permissions: readonly string[];
  readonly branches: readonly TenantContextAuthenticatedBranch[];
  readonly tenant_wide_branch_access: boolean;
  readonly subscription_status_source: SubscriptionStatusSource;
}

export interface ResolvedTenantContext {
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly tenantStatus: TenantStatus;
  readonly subscriptionStatusSource: SubscriptionStatusSource;
  readonly assignedBranchIds: readonly string[];
  readonly tenantWideBranchAccess: boolean;
  readonly effectivePermissions: readonly string[];
  readonly emailVerified: boolean;
  readonly platformSupportAccessSessionId: string | null;
}

export abstract class TenantContextResolver {
  abstract resolve(session: TenantContextAuthenticatedSession): ResolvedTenantContext;
}

export function resolveTenantContextFromAuthenticatedSession(
  session: TenantContextAuthenticatedSession,
): ResolvedTenantContext {
  if (session.actor.user_type !== TENANT_CONTEXT_USER_TYPES.TENANT_USER) {
    throw GarageOsApiException.tenantAccessDenied();
  }

  const actorTenantId = session.actor.tenant_id;

  if (!actorTenantId || !session.tenant || session.tenant.id !== actorTenantId) {
    throw GarageOsApiException.tenantAccessDenied();
  }

  return {
    actorUserId: session.actor.user_id,
    sessionId: session.actor.session_id,
    tenantId: actorTenantId,
    tenantStatus: session.tenant.status,
    subscriptionStatusSource: session.subscription_status_source,
    assignedBranchIds: session.branches.map((branch) => branch.id),
    tenantWideBranchAccess: session.tenant_wide_branch_access,
    effectivePermissions: session.effective_permissions,
    emailVerified: session.actor.email_verified,
    platformSupportAccessSessionId: session.actor.support_access_session_id,
  };
}

export function resolveTenantIdForTenantScopedOperation(
  context: ResolvedTenantContext,
  clientProvidedTenantId?: string | null,
): string {
  if (clientProvidedTenantId && clientProvidedTenantId !== context.tenantId) {
    throw GarageOsApiException.tenantAccessDenied();
  }

  return context.tenantId;
}

export function assertTenantScopedResourceBelongsToContext(
  context: ResolvedTenantContext,
  resourceTenantId: string,
): void {
  if (resourceTenantId !== context.tenantId) {
    throw GarageOsApiException.tenantAccessDenied();
  }
}
