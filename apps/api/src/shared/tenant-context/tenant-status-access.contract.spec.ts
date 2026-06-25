import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantStatus,
} from './tenant-context';
import {
  API_TENANT_STATUS_ACCESS_GUARD,
  TENANT_ACCESS_OPERATION_TYPES,
  assertTenantStatusAllowsOperation,
  evaluateTenantStatusAccess,
} from './tenant-status-access';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';

describe('tenant status access contract', () => {
  it('exposes a stable dependency-injection token for the future tenant status guard implementation', () => {
    expect(API_TENANT_STATUS_ACCESS_GUARD.description).toBe('API_TENANT_STATUS_ACCESS_GUARD');
  });

  it('uses stable operation type values for tenant status access checks', () => {
    expect(Object.values(TENANT_ACCESS_OPERATION_TYPES)).toEqual([
      'onboarding_setup',
      'operational_read',
      'operational_write',
      'report_read',
      'export_data',
      'subscription_management',
      'password_management',
      'logout',
    ]);
  });

  it('allows operational writes for active tenants', () => {
    expectAllowed({
      context: createTenantContext(TENANT_STATUSES.ACTIVE),
      operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
    });
  });

  it('allows operational writes for grace-period tenants', () => {
    expectAllowed({
      context: createTenantContext(TENANT_STATUSES.GRACE_PERIOD),
      operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
    });
  });

  it('allows only limited setup access during pending setup', () => {
    expectAllowed({
      context: createTenantContext(TENANT_STATUSES.PENDING_SETUP),
      operationType: TENANT_ACCESS_OPERATION_TYPES.ONBOARDING_SETUP,
      actorIsShopOwner: true,
    });

    expectAllowed({
      context: createTenantContext(TENANT_STATUSES.PENDING_SETUP),
      operationType: TENANT_ACCESS_OPERATION_TYPES.PASSWORD_MANAGEMENT,
    });

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context: createTenantContext(TENANT_STATUSES.PENDING_SETUP),
        operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ,
      }),
    );

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context: createTenantContext(TENANT_STATUSES.PENDING_SETUP),
        operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        actorIsShopOwner: true,
      }),
    );
  });

  it('blocks read-only tenant operational writes but allows reads, reports, renewal, password, and owner export access', () => {
    const context = createTenantContext(TENANT_STATUSES.READ_ONLY);

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ,
    });

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.REPORT_READ,
    });

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT,
    });

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.PASSWORD_MANAGEMENT,
    });

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA,
      actorIsShopOwner: true,
    });

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context,
        operationType: TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA,
        actorIsShopOwner: false,
      }),
    );

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context,
        operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
      }),
    );
  });

  it('allows only shop owner renewal/export access during suspension', () => {
    const context = createTenantContext(TENANT_STATUSES.SUSPENDED);

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT,
      actorIsShopOwner: true,
    });

    expectAllowed({
      context,
      operationType: TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA,
      actorIsShopOwner: true,
    });

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context,
        operationType: TENANT_ACCESS_OPERATION_TYPES.SUBSCRIPTION_MANAGEMENT,
        actorIsShopOwner: false,
      }),
    );

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context,
        operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ,
        actorIsShopOwner: true,
      }),
    );

    expectSubscriptionAccessBlocked(() =>
      assertTenantStatusAllowsOperation({
        context,
        operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        actorIsShopOwner: true,
      }),
    );
  });

  it('blocks pending-deletion and deleted tenants from tenant operational access', () => {
    for (const tenantStatus of [TENANT_STATUSES.PENDING_DELETION, TENANT_STATUSES.DELETED]) {
      expectSubscriptionAccessBlocked(() =>
        assertTenantStatusAllowsOperation({
          context: createTenantContext(tenantStatus),
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_READ,
          actorIsShopOwner: true,
        }),
      );

      expectSubscriptionAccessBlocked(() =>
        assertTenantStatusAllowsOperation({
          context: createTenantContext(tenantStatus),
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
          actorIsShopOwner: true,
        }),
      );
    }
  });

  it('allows logout regardless of tenant status so users are not trapped in blocked sessions', () => {
    for (const tenantStatus of Object.values(TENANT_STATUSES)) {
      expectAllowed({
        context: createTenantContext(tenantStatus),
        operationType: TENANT_ACCESS_OPERATION_TYPES.LOGOUT,
      });
    }
  });
});

function createTenantContext(tenantStatus: TenantStatus): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: [BRANCH_ID],
    tenantWideBranchAccess: false,
    effectivePermissions: ['customers.read', 'job_orders.create'],
    emailVerified: true,
    platformSupportAccessSessionId: null,
  };
}

function expectAllowed(input: Parameters<typeof evaluateTenantStatusAccess>[0]): void {
  const decision = evaluateTenantStatusAccess(input);

  expect(decision.allowed).toBe(true);
  expect(() => assertTenantStatusAllowsOperation(input)).not.toThrow();
}

function expectSubscriptionAccessBlocked(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED);
    return;
  }

  throw new Error('Expected subscription_access_blocked error.');
}
