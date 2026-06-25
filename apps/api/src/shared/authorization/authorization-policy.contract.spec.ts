import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantStatus,
} from '../tenant-context/tenant-context';
import { TENANT_ACCESS_OPERATION_TYPES } from '../tenant-context/tenant-status-access';
import {
  API_AUTHORIZATION_POLICY,
  assertPlatformSupportAuthorizationAllowed,
  assertTenantAuthorizationAllowed,
  evaluatePlatformSupportAuthorization,
  evaluateTenantAuthorization,
  type TenantAuthorizationInput,
} from './authorization-policy';
import {
  PLATFORM_SUPPORT_ACCESS_MODES,
  PLATFORM_SUPPORT_ACCESS_PERMISSION,
  PLATFORM_SUPPORT_OPERATION_TYPES,
  type PlatformSupportAccessInput,
  type PlatformSupportAccessMode,
  type ResolvedPlatformSupportAccessContext,
} from './platform-support-access';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNED_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH_ID = '55555555-5555-4555-8555-555555555555';

const PLATFORM_ADMIN_USER_ID = '66666666-6666-4666-8666-666666666666';
const SUPPORT_ACCESS_SESSION_ID = '77777777-7777-4777-8777-777777777777';

describe('authorization policy composition contract', () => {
  it('exposes a stable dependency-injection token for a future composed authorization policy implementation', () => {
    expect(API_AUTHORIZATION_POLICY.description).toBe('API_AUTHORIZATION_POLICY');
  });

  it('allows tenant authorization when tenant status, permission, and branch access all pass', () => {
    const input: TenantAuthorizationInput = {
      context: createTenantContext({
        effectivePermissions: ['job_orders.create'],
        assignedBranchIds: [ASSIGNED_BRANCH_ID],
      }),
      requirement: {
        tenantStatus: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        },
        permission: {
          permissions: ['job_orders.create'],
        },
        branchId: ASSIGNED_BRANCH_ID,
      },
    };

    const decision = evaluateTenantAuthorization(input);

    expect(decision).toMatchObject({
      allowed: true,
      reason: 'tenant_authorization_is_granted',
    });
    expect(decision.tenantStatusDecision.allowed).toBe(true);
    expect(decision.permissionDecision?.allowed).toBe(true);
    expect(decision.branchDecision?.allowed).toBe(true);
    expect(() => assertTenantAuthorizationAllowed(input)).not.toThrow();
  });

  it('checks tenant status before permission and branch authorization', () => {
    const input: TenantAuthorizationInput = {
      context: createTenantContext({
        tenantStatus: TENANT_STATUSES.READ_ONLY,
        effectivePermissions: [],
        assignedBranchIds: [],
      }),
      requirement: {
        tenantStatus: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        },
        permission: {
          permissions: ['job_orders.create'],
        },
        branchId: OTHER_BRANCH_ID,
      },
    };

    const decision = evaluateTenantAuthorization(input);

    expect(decision).toMatchObject({
      allowed: false,
      permissionDecision: null,
      branchDecision: null,
      reason: 'tenant_status_authorization_blocked',
    });
    expectErrorCode(
      () => assertTenantAuthorizationAllowed(input),
      API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    );
  });

  it('checks permission before branch authorization after tenant status passes', () => {
    const input: TenantAuthorizationInput = {
      context: createTenantContext({
        effectivePermissions: [],
        assignedBranchIds: [],
      }),
      requirement: {
        tenantStatus: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        },
        permission: {
          permissions: ['job_orders.create'],
        },
        branchId: OTHER_BRANCH_ID,
      },
    };

    const decision = evaluateTenantAuthorization(input);

    expect(decision).toMatchObject({
      allowed: false,
      branchDecision: null,
      reason: 'permission_authorization_blocked',
    });
    expect(decision.permissionDecision?.missingPermissions).toEqual(['job_orders.create']);

    expectForbidden(() => assertTenantAuthorizationAllowed(input), 'job_orders.create');
  });

  it('checks branch authorization after tenant status and permission pass', () => {
    const input: TenantAuthorizationInput = {
      context: createTenantContext({
        effectivePermissions: ['job_orders.create'],
        assignedBranchIds: [ASSIGNED_BRANCH_ID],
      }),
      requirement: {
        tenantStatus: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        },
        permission: {
          permissions: ['job_orders.create'],
        },
        branchId: OTHER_BRANCH_ID,
      },
    };

    const decision = evaluateTenantAuthorization(input);

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'branch_authorization_blocked',
    });
    expect(decision.branchDecision?.allowed).toBe(false);

    expectErrorCode(
      () => assertTenantAuthorizationAllowed(input),
      API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    );
  });

  it('allows tenant-wide entity authorization without a branch check when no branch requirement is declared', () => {
    const input: TenantAuthorizationInput = {
      context: createTenantContext({
        effectivePermissions: ['customers.read'],
        assignedBranchIds: [],
      }),
      requirement: {
        tenantStatus: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ,
        },
        permission: {
          permissions: ['customers.read'],
        },
      },
    };

    const decision = evaluateTenantAuthorization(input);

    expect(decision).toMatchObject({
      allowed: true,
      branchDecision: null,
      reason: 'tenant_authorization_is_granted',
    });
    expect(() => assertTenantAuthorizationAllowed(input)).not.toThrow();
  });

  it('keeps platform support authorization separate from tenant permission and branch checks', () => {
    const input: PlatformSupportAccessInput = {
      context: createSupportContext({
        accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
        effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.read'],
      }),
      requirement: {
        operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
        requiredPlatformPermissions: ['platform.tenants.read'],
      },
    };

    const decision = evaluatePlatformSupportAuthorization(input);

    expect(decision).toMatchObject({
      allowed: true,
      reason: 'read_only_support_access_is_granted',
    });
    expect(() => assertPlatformSupportAuthorizationAllowed(input)).not.toThrow();
  });

  it('blocks platform support tenant writes when the support access mode is read-only', () => {
    const input: PlatformSupportAccessInput = {
      context: createSupportContext({
        accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
        effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
      }),
      requirement: {
        operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
        requiredPlatformPermissions: ['platform.tenants.update'],
      },
    };

    const decision = evaluatePlatformSupportAuthorization(input);

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'support_access_mode_blocks_tenant_write',
    });

    expectForbidden(() => assertPlatformSupportAuthorizationAllowed(input));
  });
});

interface CreateTenantContextOptions {
  readonly tenantStatus?: TenantStatus;
  readonly effectivePermissions?: readonly string[];
  readonly assignedBranchIds?: readonly string[];
  readonly tenantWideBranchAccess?: boolean;
}

function createTenantContext(options: CreateTenantContextOptions = {}): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus: options.tenantStatus ?? TENANT_STATUSES.ACTIVE,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: options.assignedBranchIds ?? [ASSIGNED_BRANCH_ID],
    tenantWideBranchAccess: options.tenantWideBranchAccess ?? false,
    effectivePermissions: options.effectivePermissions ?? [],
    emailVerified: true,
    platformSupportAccessSessionId: null,
  };
}

interface CreateSupportContextOptions {
  readonly accessMode?: PlatformSupportAccessMode;
  readonly effectivePermissions?: readonly string[];
}

function createSupportContext(
  options: CreateSupportContextOptions = {},
): ResolvedPlatformSupportAccessContext {
  return {
    platformAdminUserId: PLATFORM_ADMIN_USER_ID,
    tenantId: TENANT_ID,
    supportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
    accessMode: options.accessMode ?? PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
    effectivePermissions: options.effectivePermissions ?? [PLATFORM_SUPPORT_ACCESS_PERMISSION],
  };
}

function expectErrorCode(action: () => unknown, expectedCode: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(expectedCode);
    return;
  }

  throw new Error(`Expected ${expectedCode} error.`);
}

function expectForbidden(action: () => unknown, requiredPermission?: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.FORBIDDEN);
    expect((error as GarageOsApiException).details).toEqual(
      requiredPermission ? [{ required_permission: requiredPermission }] : [],
    );
    return;
  }

  throw new Error('Expected forbidden error.');
}
