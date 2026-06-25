import type { ResolvedTenantContext } from '../tenant-context/tenant-context';
import {
  assertTenantStatusAllowsOperation,
  evaluateTenantStatusAccess,
  type TenantAccessOperationType,
  type TenantStatusAccessDecision,
  type TenantStatusAccessInput,
} from '../tenant-context/tenant-status-access';
import {
  assertBranchAccessAllowed,
  evaluateBranchAccess,
  type BranchAccessDecision,
} from './branch-access';
import {
  assertPermissionAccessAllowed,
  evaluatePermissionAccess,
  type PermissionAccessDecision,
  type PermissionAccessRequirement,
} from './permission-access';
import {
  assertPlatformSupportAccessAllowed as assertPlatformSupportAccessBoundaryAllowed,
  evaluatePlatformSupportAccess,
  type PlatformSupportAccessDecision,
  type PlatformSupportAccessInput,
} from './platform-support-access';

export const API_AUTHORIZATION_POLICY = Symbol('API_AUTHORIZATION_POLICY');

export interface TenantStatusAuthorizationRequirement {
  readonly operationType: TenantAccessOperationType;
  readonly actorIsShopOwner?: boolean;
}

export interface TenantAuthorizationRequirement {
  readonly tenantStatus: TenantStatusAuthorizationRequirement;
  readonly permission?: PermissionAccessRequirement;
  readonly branchId?: string;
}

export interface TenantAuthorizationInput {
  readonly context: ResolvedTenantContext;
  readonly requirement: TenantAuthorizationRequirement;
}

export interface TenantAuthorizationDecision {
  readonly allowed: boolean;
  readonly tenantStatusDecision: TenantStatusAccessDecision;
  readonly permissionDecision: PermissionAccessDecision | null;
  readonly branchDecision: BranchAccessDecision | null;
  readonly reason: string;
}

export abstract class AuthorizationPolicy {
  abstract assertTenantAuthorizationAllowed(input: TenantAuthorizationInput): void;

  abstract assertPlatformSupportAuthorizationAllowed(input: PlatformSupportAccessInput): void;
}

export function evaluateTenantAuthorization(
  input: TenantAuthorizationInput,
): TenantAuthorizationDecision {
  const tenantStatusDecision = evaluateTenantStatusAccess(createTenantStatusAccessInput(input));

  if (!tenantStatusDecision.allowed) {
    return {
      allowed: false,
      tenantStatusDecision,
      permissionDecision: null,
      branchDecision: null,
      reason: 'tenant_status_authorization_blocked',
    };
  }

  const permissionDecision = input.requirement.permission
    ? evaluatePermissionAccess({
        context: input.context,
        requirement: input.requirement.permission,
      })
    : null;

  if (permissionDecision && !permissionDecision.allowed) {
    return {
      allowed: false,
      tenantStatusDecision,
      permissionDecision,
      branchDecision: null,
      reason: 'permission_authorization_blocked',
    };
  }

  const branchDecision =
    input.requirement.branchId !== undefined
      ? evaluateBranchAccess({
          context: input.context,
          branchId: input.requirement.branchId,
        })
      : null;

  if (branchDecision && !branchDecision.allowed) {
    return {
      allowed: false,
      tenantStatusDecision,
      permissionDecision,
      branchDecision,
      reason: 'branch_authorization_blocked',
    };
  }

  return {
    allowed: true,
    tenantStatusDecision,
    permissionDecision,
    branchDecision,
    reason: 'tenant_authorization_is_granted',
  };
}

export function assertTenantAuthorizationAllowed(input: TenantAuthorizationInput): void {
  assertTenantStatusAllowsOperation(createTenantStatusAccessInput(input));

  if (input.requirement.permission) {
    assertPermissionAccessAllowed({
      context: input.context,
      requirement: input.requirement.permission,
    });
  }

  if (input.requirement.branchId !== undefined) {
    assertBranchAccessAllowed({
      context: input.context,
      branchId: input.requirement.branchId,
    });
  }
}

export function evaluatePlatformSupportAuthorization(
  input: PlatformSupportAccessInput,
): PlatformSupportAccessDecision {
  return evaluatePlatformSupportAccess(input);
}

export function assertPlatformSupportAuthorizationAllowed(input: PlatformSupportAccessInput): void {
  assertPlatformSupportAccessBoundaryAllowed(input);
}

function createTenantStatusAccessInput(input: TenantAuthorizationInput): TenantStatusAccessInput {
  const tenantStatusInput = {
    context: input.context,
    operationType: input.requirement.tenantStatus.operationType,
  };

  if (input.requirement.tenantStatus.actorIsShopOwner === undefined) {
    return tenantStatusInput;
  }

  return {
    ...tenantStatusInput,
    actorIsShopOwner: input.requirement.tenantStatus.actorIsShopOwner,
  };
}
