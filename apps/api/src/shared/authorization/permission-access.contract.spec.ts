import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
} from '../tenant-context/tenant-context';
import {
  API_PERMISSION_ACCESS_GUARD,
  PERMISSION_REQUIREMENT_MODES,
  assertPermissionAccessAllowed,
  evaluatePermissionAccess,
  type PermissionAccessInput,
} from './permission-access';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';

describe('permission access contract', () => {
  it('exposes a stable dependency-injection token for the future permission guard implementation', () => {
    expect(API_PERMISSION_ACCESS_GUARD.description).toBe('API_PERMISSION_ACCESS_GUARD');
  });

  it('uses stable permission requirement mode values', () => {
    expect(Object.values(PERMISSION_REQUIREMENT_MODES)).toEqual(['all', 'any']);
  });

  it('allows access when a required permission is present in the resolved tenant context', () => {
    expectAllowed({
      context: createTenantContext(['customers.read']),
      requirement: {
        permissions: ['customers.read'],
      },
    });
  });

  it('blocks access when a required permission is missing from the resolved tenant context', () => {
    expectForbidden(
      () =>
        assertPermissionAccessAllowed({
          context: createTenantContext(['customers.read']),
          requirement: {
            permissions: ['customers.create'],
          },
        }),
      'customers.create',
    );
  });

  it('requires all permissions by default when multiple permissions are configured', () => {
    expectAllowed({
      context: createTenantContext(['customers.read', 'customers.create']),
      requirement: {
        permissions: ['customers.read', 'customers.create'],
      },
    });

    expectForbidden(
      () =>
        assertPermissionAccessAllowed({
          context: createTenantContext(['customers.read']),
          requirement: {
            permissions: ['customers.read', 'customers.create'],
          },
        }),
      'customers.create',
    );
  });

  it('allows access when any configured alternative permission is present', () => {
    expectAllowed({
      context: createTenantContext(['reports.view_basic']),
      requirement: {
        permissions: ['invoices.read', 'reports.view_basic'],
        mode: PERMISSION_REQUIREMENT_MODES.ANY,
      },
    });
  });

  it('blocks access when none of the configured alternative permissions are present', () => {
    expectForbidden(
      () =>
        assertPermissionAccessAllowed({
          context: createTenantContext(['customers.read']),
          requirement: {
            permissions: ['invoices.read', 'reports.view_basic'],
            mode: PERMISSION_REQUIREMENT_MODES.ANY,
          },
        }),
      'invoices.read or reports.view_basic',
    );
  });

  it('normalizes duplicate and padded permission requirements before evaluating access', () => {
    const decision = evaluatePermissionAccess({
      context: createTenantContext(['customers.read']),
      requirement: {
        permissions: [' customers.read ', 'customers.read'],
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      requiredPermissions: ['customers.read'],
      grantedPermissions: ['customers.read'],
      missingPermissions: [],
    });
  });

  it('rejects an empty permission requirement because every protected endpoint must declare permissions', () => {
    expect(() =>
      evaluatePermissionAccess({
        context: createTenantContext(['customers.read']),
        requirement: {
          permissions: [],
        },
      }),
    ).toThrow('Permission requirement must include at least one permission.');
  });

  it('rejects platform permissions because tenant permission access must not authorize platform scope', () => {
    expect(() =>
      evaluatePermissionAccess({
        context: createTenantContext(['platform.tenants.read']),
        requirement: {
          permissions: ['platform.tenants.read'],
        },
      }),
    ).toThrow(
      'Tenant permission access guard cannot enforce platform permissions. Use a platform/support authorization boundary instead.',
    );
  });
});

function createTenantContext(effectivePermissions: readonly string[]): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus: TENANT_STATUSES.ACTIVE,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: [BRANCH_ID],
    tenantWideBranchAccess: false,
    effectivePermissions,
    emailVerified: true,
    platformSupportAccessSessionId: null,
  };
}

function expectAllowed(input: PermissionAccessInput): void {
  const decision = evaluatePermissionAccess(input);

  expect(decision.allowed).toBe(true);
  expect(() => assertPermissionAccessAllowed(input)).not.toThrow();
}

function expectForbidden(action: () => unknown, requiredPermission: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.FORBIDDEN);
    expect((error as GarageOsApiException).details).toEqual([
      {
        required_permission: requiredPermission,
      },
    ]);
    return;
  }

  throw new Error('Expected forbidden error.');
}
