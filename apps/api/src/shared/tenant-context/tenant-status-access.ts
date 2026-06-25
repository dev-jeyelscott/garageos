import { GarageOsApiException } from '../api/api-exception';
import { TENANT_STATUSES, type ResolvedTenantContext, type TenantStatus } from './tenant-context';

export const API_TENANT_STATUS_ACCESS_GUARD = Symbol('API_TENANT_STATUS_ACCESS_GUARD');

export const TENANT_ACCESS_OPERATION_TYPES = {
  ONBOARDING_SETUP: 'onboarding_setup',
  OPERATIONAL_READ: 'operational_read',
  OPERATIONAL_WRITE: 'operational_write',
  REPORT_READ: 'report_read',
  EXPORT_DATA: 'export_data',
  SUBSCRIPTION_MANAGEMENT: 'subscription_management',
  PASSWORD_MANAGEMENT: 'password_management',
  LOGOUT: 'logout',
} as const;

export type TenantAccessOperationType =
  (typeof TENANT_ACCESS_OPERATION_TYPES)[keyof typeof TENANT_ACCESS_OPERATION_TYPES];

export interface TenantStatusAccessInput {
  readonly context: ResolvedTenantContext;
  readonly operationType: TenantAccessOperationType;
  readonly actorIsShopOwner?: boolean;
}

export interface TenantStatusAccessDecision {
  readonly allowed: boolean;
  readonly tenantStatus: TenantStatus;
  readonly operationType: TenantAccessOperationType;
  readonly reason: string;
}

export abstract class TenantStatusAccessGuard {
  abstract assertAllowed(input: TenantStatusAccessInput): void;
}

export function evaluateTenantStatusAccess(
  input: TenantStatusAccessInput,
): TenantStatusAccessDecision {
  const tenantStatus = input.context.tenantStatus;
  const operationType = input.operationType;

  if (operationType === TENANT_ACCESS_OPERATION_TYPES.LOGOUT) {
    return allow(input, 'logout_is_always_allowed');
  }

  if (tenantStatus === TENANT_STATUSES.ACTIVE || tenantStatus === TENANT_STATUSES.GRACE_PERIOD) {
    return allow(input, 'tenant_status_allows_full_permission_based_access');
  }

  if (tenantStatus === TENANT_STATUSES.PENDING_SETUP) {
    return evaluatePendingSetupAccess(input);
  }

  if (tenantStatus === TENANT_STATUSES.READ_ONLY) {
    return evaluateReadOnlyAccess(input);
  }

  if (tenantStatus === TENANT_STATUSES.SUSPENDED) {
    return evaluateSuspendedAccess(input);
  }

  if (
    tenantStatus === TENANT_STATUSES.PENDING_DELETION ||
    tenantStatus === TENANT_STATUSES.DELETED
  ) {
    return block(input, 'tenant_status_blocks_all_tenant_operational_access');
  }

  return block(input, 'tenant_status_is_not_allowed');
}

export function assertTenantStatusAllowsOperation(input: TenantStatusAccessInput): void {
  const decision = evaluateTenantStatusAccess(input);

  if (!decision.allowed) {
    throw GarageOsApiException.subscriptionAccessBlocked();
  }
}

function evaluatePendingSetupAccess(input: TenantStatusAccessInput): TenantStatusAccessDecision {
  if (
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.PASSWORD_MANAGEMENT ||
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT
  ) {
    return allow(input, 'pending_setup_allows_limited_account_and_subscription_access');
  }

  if (
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.ONBOARDING_SETUP &&
    input.actorIsShopOwner === true
  ) {
    return allow(input, 'pending_setup_allows_shop_owner_onboarding_access');
  }

  return block(input, 'pending_setup_blocks_operational_access');
}

function evaluateReadOnlyAccess(input: TenantStatusAccessInput): TenantStatusAccessDecision {
  if (
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ ||
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.REPORT_READ ||
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT ||
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.PASSWORD_MANAGEMENT
  ) {
    return allow(input, 'read_only_allows_read_renewal_and_password_access');
  }

  if (
    input.operationType === TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA &&
    input.actorIsShopOwner === true
  ) {
    return allow(input, 'read_only_allows_shop_owner_export_access');
  }

  return block(input, 'read_only_blocks_operational_writes');
}

function evaluateSuspendedAccess(input: TenantStatusAccessInput): TenantStatusAccessDecision {
  if (
    input.actorIsShopOwner === true &&
    (input.operationType === TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT ||
      input.operationType === TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA)
  ) {
    return allow(input, 'suspended_allows_shop_owner_renewal_and_export_access');
  }

  return block(input, 'suspended_blocks_non_owner_and_operational_access');
}

function allow(input: TenantStatusAccessInput, reason: string): TenantStatusAccessDecision {
  return {
    allowed: true,
    tenantStatus: input.context.tenantStatus,
    operationType: input.operationType,
    reason,
  };
}

function block(input: TenantStatusAccessInput, reason: string): TenantStatusAccessDecision {
  return {
    allowed: false,
    tenantStatus: input.context.tenantStatus,
    operationType: input.operationType,
    reason,
  };
}
