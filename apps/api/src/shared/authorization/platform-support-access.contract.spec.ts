import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  API_PLATFORM_SUPPORT_ACCESS_GUARD,
  PLATFORM_SUPPORT_ACCESS_MODES,
  PLATFORM_SUPPORT_ACCESS_PERMISSION,
  PLATFORM_SUPPORT_OPERATION_TYPES,
  assertPlatformSupportAccessAllowed,
  evaluatePlatformSupportAccess,
  type PlatformSupportAccessInput,
  type PlatformSupportAccessMode,
  type ResolvedPlatformSupportAccessContext,
} from './platform-support-access';

const PLATFORM_ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const SUPPORT_ACCESS_SESSION_ID = '33333333-3333-4333-8333-333333333333';

describe('platform support access contract', () => {
  it('exposes a stable dependency-injection token for the future platform support access guard implementation', () => {
    expect(API_PLATFORM_SUPPORT_ACCESS_GUARD.description).toBe('API_PLATFORM_SUPPORT_ACCESS_GUARD');
  });

  it('uses stable support access mode values', () => {
    expect(Object.values(PLATFORM_SUPPORT_ACCESS_MODES)).toEqual(['read_only', 'write_allowed']);
  });

  it('uses stable operation type values for platform support access checks', () => {
    expect(Object.values(PLATFORM_SUPPORT_OPERATION_TYPES)).toEqual([
      'tenant_read',
      'tenant_write',
    ]);
  });

  it('always requires platform.support_access for tenant support access', () => {
    expectForbidden(
      () =>
        assertPlatformSupportAccessAllowed({
          context: createSupportContext({
            effectivePermissions: ['platform.tenants.read'],
          }),
          requirement: {
            operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
            requiredPlatformPermissions: ['platform.tenants.read'],
          },
        }),
      PLATFORM_SUPPORT_ACCESS_PERMISSION,
    );
  });

  it('allows read-only support access for tenant read operations when platform support permission is granted', () => {
    expectAllowed({
      context: createSupportContext({
        accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
        effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.read'],
      }),
      requirement: {
        operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
        requiredPlatformPermissions: ['platform.tenants.read'],
      },
    });
  });

  it('blocks tenant write operations when support access mode is read-only', () => {
    expectForbidden(() =>
      assertPlatformSupportAccessAllowed({
        context: createSupportContext({
          accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
          effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
        }),
        requirement: {
          operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
          requiredPlatformPermissions: ['platform.tenants.update'],
        },
      }),
    );
  });

  it('allows tenant write operations only when write-allowed support access and required platform permission are granted', () => {
    expectAllowed({
      context: createSupportContext({
        accessMode: PLATFORM_SUPPORT_ACCESS_MODES.WRITE_ALLOWED,
        effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
      }),
      requirement: {
        operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
        requiredPlatformPermissions: ['platform.tenants.update'],
      },
    });
  });

  it('blocks tenant write operations when the required platform operation permission is missing', () => {
    expectForbidden(
      () =>
        assertPlatformSupportAccessAllowed({
          context: createSupportContext({
            accessMode: PLATFORM_SUPPORT_ACCESS_MODES.WRITE_ALLOWED,
            effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION],
          }),
          requirement: {
            operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
            requiredPlatformPermissions: ['platform.tenants.update'],
          },
        }),
      'platform.tenants.update',
    );
  });

  it('normalizes duplicate and padded platform permission requirements before evaluating access', () => {
    const decision = evaluatePlatformSupportAccess({
      context: createSupportContext({
        accessMode: PLATFORM_SUPPORT_ACCESS_MODES.WRITE_ALLOWED,
        effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
      }),
      requirement: {
        operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE,
        requiredPlatformPermissions: [' platform.tenants.update ', 'platform.tenants.update'],
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      requiredPlatformPermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
      grantedPlatformPermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION, 'platform.tenants.update'],
      missingPlatformPermissions: [],
      reason: 'write_allowed_support_access_is_granted',
    });
  });

  it('rejects tenant permissions because platform support access must use platform permission scope', () => {
    expect(() =>
      evaluatePlatformSupportAccess({
        context: createSupportContext({
          effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION],
        }),
        requirement: {
          operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
          requiredPlatformPermissions: ['customers.read'],
        },
      }),
    ).toThrow('Platform support access guard can enforce only platform permissions.');
  });

  it('rejects missing support access session context because support access must be explicit and audited', () => {
    expect(() =>
      evaluatePlatformSupportAccess({
        context: {
          platformAdminUserId: PLATFORM_ADMIN_USER_ID,
          tenantId: TENANT_ID,
          supportAccessSessionId: ' ',
          accessMode: PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY,
          effectivePermissions: [PLATFORM_SUPPORT_ACCESS_PERMISSION],
        },
        requirement: {
          operationType: PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ,
        },
      }),
    ).toThrow('Platform support access requires a support access session ID.');
  });
});

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

function expectAllowed(input: PlatformSupportAccessInput): void {
  const decision = evaluatePlatformSupportAccess(input);

  expect(decision.allowed).toBe(true);
  expect(() => assertPlatformSupportAccessAllowed(input)).not.toThrow();
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
