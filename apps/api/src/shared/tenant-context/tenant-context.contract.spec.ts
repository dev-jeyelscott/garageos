// apps/api/src/shared/tenant-context/tenant-context.contract.spec.ts

import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  API_TENANT_CONTEXT_RESOLVER,
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_CONTEXT_USER_TYPES,
  TENANT_STATUSES,
  assertTenantScopedResourceBelongsToContext,
  resolveTenantContextFromAuthenticatedSession,
  resolveTenantIdForTenantScopedOperation,
  type TenantContextAuthenticatedSession,
} from './tenant-context';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';

describe('tenant context contract', () => {
  it('exposes a stable dependency-injection token for the future resolver implementation', () => {
    expect(API_TENANT_CONTEXT_RESOLVER.description).toBe('API_TENANT_CONTEXT_RESOLVER');
  });

  it('uses schema-aligned tenant context enum values', () => {
    expect(Object.values(TENANT_CONTEXT_USER_TYPES)).toEqual(['tenant_user', 'platform_admin']);

    expect(Object.values(TENANT_STATUSES)).toEqual([
      'pending_setup',
      'active',
      'grace_period',
      'read_only',
      'suspended',
      'pending_deletion',
      'deleted',
    ]);

    expect(Object.values(SUBSCRIPTION_STATUS_SOURCES)).toEqual([
      'system_computed',
      'platform_override',
    ]);
  });

  it('resolves tenant context from the authenticated tenant-user session', () => {
    const context = resolveTenantContextFromAuthenticatedSession(createTenantSession());

    expect(context).toEqual({
      actorUserId: USER_ID,
      sessionId: SESSION_ID,
      tenantId: TENANT_ID,
      tenantStatus: 'active',
      subscriptionStatusSource: 'system_computed',
      assignedBranchIds: [BRANCH_ID],
      tenantWideBranchAccess: false,
      effectivePermissions: ['customers.read', 'job_orders.create'],
      emailVerified: true,
      platformSupportAccessSessionId: null,
    });
  });

  it('returns the authenticated tenant id instead of trusting a matching client-provided tenant id', () => {
    const context = resolveTenantContextFromAuthenticatedSession(createTenantSession());

    expect(resolveTenantIdForTenantScopedOperation(context, TENANT_ID)).toBe(TENANT_ID);
    expect(resolveTenantIdForTenantScopedOperation(context)).toBe(TENANT_ID);
  });

  it('rejects client-provided tenant ids that attempt to switch tenant scope', () => {
    const context = resolveTenantContextFromAuthenticatedSession(createTenantSession());

    expectTenantAccessDenied(() =>
      resolveTenantIdForTenantScopedOperation(context, '55555555-5555-4555-8555-555555555555'),
    );
  });

  it('rejects tenant-scoped resources that do not belong to the resolved tenant context', () => {
    const context = resolveTenantContextFromAuthenticatedSession(createTenantSession());

    expect(() => assertTenantScopedResourceBelongsToContext(context, TENANT_ID)).not.toThrow();

    expectTenantAccessDenied(() =>
      assertTenantScopedResourceBelongsToContext(context, '55555555-5555-4555-8555-555555555555'),
    );
  });

  it('rejects platform admins until platform support context is explicitly scaffolded', () => {
    expectTenantAccessDenied(() =>
      resolveTenantContextFromAuthenticatedSession({
        actor: {
          user_id: USER_ID,
          user_type: TENANT_CONTEXT_USER_TYPES.PLATFORM_ADMIN,
          tenant_id: null,
          session_id: SESSION_ID,
          email_verified: true,
          support_access_session_id: null,
        },
        tenant: null,
        effective_permissions: ['platform.tenants.read'],
        branches: [],
        tenant_wide_branch_access: false,
        subscription_status_source: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
      }),
    );
  });

  it('rejects inconsistent authenticated session tenant data', () => {
    expectTenantAccessDenied(() =>
      resolveTenantContextFromAuthenticatedSession(
        createTenantSession({
          tenant: {
            id: '55555555-5555-4555-8555-555555555555',
            status: TENANT_STATUSES.ACTIVE,
          },
        }),
      ),
    );
  });
});

function createTenantSession(
  overrides: Partial<TenantContextAuthenticatedSession> = {},
): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: TENANT_CONTEXT_USER_TYPES.TENANT_USER,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: TENANT_STATUSES.ACTIVE,
    },
    effective_permissions: ['customers.read', 'job_orders.create'],
    branches: [
      {
        id: BRANCH_ID,
      },
    ],
    tenant_wide_branch_access: false,
    subscription_status_source: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    ...overrides,
  };
}

function expectTenantAccessDenied(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.TENANT_ACCESS_DENIED);
    return;
  }

  throw new Error('Expected tenant_access_denied error.');
}
