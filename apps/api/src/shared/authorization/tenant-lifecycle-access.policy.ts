import { GarageOsApiException } from '../api/api-exception';
import { TENANT_STATUSES, type ResolvedTenantContext } from '../tenant-context/tenant-context';

export const TENANT_ACCESS_ACTIONS = {
  ONBOARDING_SETUP: 'onboarding_setup',
  OPERATIONAL_READ: 'operational_read',
  OPERATIONAL_WRITE: 'operational_write',
  RENEWAL_REQUEST: 'renewal_request',
  TENANT_EXPORT: 'tenant_export',
  PASSWORD_MANAGEMENT: 'password_management',
  LOGOUT: 'logout',
} as const;

export type TenantAccessAction = (typeof TENANT_ACCESS_ACTIONS)[keyof typeof TENANT_ACCESS_ACTIONS];

export interface TenantLifecycleAccessInput {
  readonly context: ResolvedTenantContext;
  readonly action: TenantAccessAction;
  readonly isShopOwner: boolean;
}

export function assertTenantLifecycleAccess(input: TenantLifecycleAccessInput): void {
  const { context, action, isShopOwner } = input;

  if (!context.emailVerified && action !== TENANT_ACCESS_ACTIONS.LOGOUT) {
    throw GarageOsApiException.forbidden(undefined, 'Email verification is required.');
  }

  switch (context.tenantStatus) {
    case TENANT_STATUSES.PENDING_SETUP:
      if (
        isShopOwner &&
        isAllowedTenantAccessAction(action, [
          TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
          TENANT_ACCESS_ACTIONS.PASSWORD_MANAGEMENT,
          TENANT_ACCESS_ACTIONS.LOGOUT,
          TENANT_ACCESS_ACTIONS.RENEWAL_REQUEST,
        ])
      ) {
        return;
      }

      throw GarageOsApiException.subscriptionAccessBlocked();

    case TENANT_STATUSES.ACTIVE:
    case TENANT_STATUSES.GRACE_PERIOD:
      return;

    case TENANT_STATUSES.READ_ONLY:
      if (
        isAllowedTenantAccessAction(action, [
          TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
          TENANT_ACCESS_ACTIONS.RENEWAL_REQUEST,
          TENANT_ACCESS_ACTIONS.TENANT_EXPORT,
          TENANT_ACCESS_ACTIONS.PASSWORD_MANAGEMENT,
          TENANT_ACCESS_ACTIONS.LOGOUT,
        ])
      ) {
        return;
      }

      throw GarageOsApiException.subscriptionAccessBlocked();

    case TENANT_STATUSES.SUSPENDED:
      if (
        isShopOwner &&
        isAllowedTenantAccessAction(action, [
          TENANT_ACCESS_ACTIONS.RENEWAL_REQUEST,
          TENANT_ACCESS_ACTIONS.TENANT_EXPORT,
          TENANT_ACCESS_ACTIONS.PASSWORD_MANAGEMENT,
          TENANT_ACCESS_ACTIONS.LOGOUT,
        ])
      ) {
        return;
      }

      throw GarageOsApiException.subscriptionAccessBlocked();

    case TENANT_STATUSES.PENDING_DELETION:
    case TENANT_STATUSES.DELETED:
      if (action === TENANT_ACCESS_ACTIONS.LOGOUT) {
        return;
      }

      throw GarageOsApiException.subscriptionAccessBlocked();
  }
}

function isAllowedTenantAccessAction(
  action: TenantAccessAction,
  allowedActions: readonly TenantAccessAction[],
): boolean {
  return allowedActions.includes(action);
}
