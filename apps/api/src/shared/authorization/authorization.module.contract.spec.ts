import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantStatus,
} from '../tenant-context/tenant-context';
import {
  API_TENANT_STATUS_ACCESS_GUARD,
  TENANT_ACCESS_OPERATION_TYPES,
} from '../tenant-context/tenant-status-access';
import { API_AUTHORIZATION_POLICY } from './authorization-policy';
import { API_BRANCH_ACCESS_GUARD } from './branch-access';
import { API_PERMISSION_ACCESS_GUARD } from './permission-access';
import {
  API_PLATFORM_SUPPORT_ACCESS_GUARD,
  PLATFORM_SUPPORT_ACCESS_MODES,
  PLATFORM_SUPPORT_ACCESS_PERMISSION,
  PLATFORM_SUPPORT_OPERATION_TYPES,
  type PlatformSupportAccessMode,
  type ResolvedPlatformSupportAccessContext,
} from './platform-support-access';
import { AuthorizationModule } from './authorization.module';
import {
  AUTHORIZATION_POLICY_EXPORTS,
  AUTHORIZATION_POLICY_PROVIDERS,
  BranchAccessPolicy,
  ComposedAuthorizationPolicy,
  PermissionAccessPolicy,
  PlatformSupportAccessPolicy,
  TenantStatusAccessPolicy,
} from './authorization.providers';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNED_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH_ID = '55555555-5555-4555-8555-555555555555';

const PLATFORM_ADMIN_USER_ID = '66666666-6666-4666-8666-666666666666';
const SUPPORT_ACCESS_SESSION_ID = '77777777-7777-4777-8777-777777777777';

describe('authorization module contract', () => {
  it('exposes a lightweight Nest module for future authorization provider imports', () => {
    expect(AuthorizationModule).toBeDefined();

    expect(AUTHORIZATION_POLICY_EXPORTS).toEqual([
      API_TENANT_STATUS_ACCESS_GUARD,
      API_PERMISSION_ACCESS_GUARD,
      API_BRANCH_ACCESS_GUARD,
      API_PLATFORM_SUPPORT_ACCESS_GUARD,
      API_AUTHORIZATION_POLICY,
    ]);

    expect(AUTHORIZATION_POLICY_PROVIDERS).toEqual(
      expect.arrayContaining([
        TenantStatusAccessPolicy,
        PermissionAccessPolicy,
        BranchAccessPolicy,
        PlatformSupportAccessPolicy,
        ComposedAuthorizationPolicy,
        {
          provide: API_TENANT_STATUS_ACCESS_GUARD,
          useExisting: TenantStatusAccessPolicy,
        },
        {
          provide: API_PERMISSION_ACCESS_GUARD,
          useExisting: PermissionAccessPolicy,
        },
        {
          provide: API_BRANCH_ACCESS_GUARD,
          useExisting: BranchAccessPolicy,
        },
        {
          provide: API_PLATFORM_SUPPORT_ACCESS_GUARD,
          useExisting: PlatformSupportAccessPolicy,
        },
        {
          provide: API_AUTHORIZATION_POLICY,
          useExisting: ComposedAuthorizationPolicy,
        },
      ]),
    );
  });

  it('delegates composed tenant authorization to the existing pure policy helper', () => {
    const policy = new ComposedAuthorizationPolicy();

    expect(() =>
      policy.assertTenantAuthorizationAllowed({
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
      }),
    ).not.toThrow();

    expectGarageOsErrorCode(
      () =>
        policy.assertTenantAuthorizationAllowed({
          context: createTenantContext({
            tenantStatus: TENANT_STATUSES.READ_ONLY,
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
        }),
      API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    );
  });

  it('delegates individual tenant access adapters to the existing pure guard helpers', () => {
    expectGarageOsErrorCode(
      () =>
        new TenantStatusAccessPolicy().assertAllowed({
          context: createTenantContext({
            tenantStatus: TENANT_STATUSES.READ_ONLY,
          }),
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        }),
      API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    );

    expectGarageOsErrorCode(
      () =>
        new PermissionAccessPolicy().assertAllowed({
          context: createTenantContext({
            effectivePermissions: [],
          }),
          requirement: {
            permissions: ['customers.read'],
          },
        }),
      API_ERROR_CODES.FORBIDDEN,
    );

    expectGarageOsErrorCode(
      () =>
        new BranchAccessPolicy().assertAllowed({
          context: createTenantContext({
            assignedBranchIds: [ASSIGNED_BRANCH_ID],
          }),
          branchId: OTHER_BRANCH_ID,
        }),
      API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    );
  });

  it('delegates platform support access adapter without mixing tenant permission or branch checks', () => {
    expect(() =>
      new PlatformSupportAccessPolicy().assertAllowed({
        context: createSupportContext({
          accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
          effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.read'],
        }),
        requirement: {
          operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
          requiredPlatformPermissions: ['platform.tenants.read'],
        },
      }),
    ).not.toThrow();

    expectGarageOsErrorCode(
      () =>
        new PlatformSupportAccessPolicy().assertAllowed({
          context: createSupportContext({
            accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
            effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
          }),
          requirement: {
            operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
            requiredPlatformPermissions: ['platform.tenants.update'],
          },
        }),
      API_ERROR_CODES.FORBIDDEN,
    );
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

function expectGarageOsErrorCode(action: () => unknown, expectedCode: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(expectedCode);
    return;
  }

  throw new Error(`Expected ${expectedCode} error.`);
}
