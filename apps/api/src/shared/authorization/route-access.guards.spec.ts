import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_CONTEXT_USER_TYPES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../tenant-context/tenant-context';
import {
  TENANT_ACCESS_OPERATION_TYPES,
  type TenantStatusAccessInput,
} from '../tenant-context/tenant-status-access';
import { TenantContextRouteGuard } from '../tenant-context/tenant-context-route.guard';
import { TenantStatusAccessRouteGuard } from '../tenant-context/tenant-status-access-route.guard';
import { BranchAccessRouteGuard } from './branch-access-route.guard';
import { PermissionAccessRouteGuard } from './permission-access-route.guard';
import { PERMISSION_REQUIREMENT_MODES } from './permission-access';
import type { GarageOsRouteAccessRequest } from './route-access-context';
import { GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS } from './route-access.decorators';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH_ID = '55555555-5555-4555-8555-555555555555';

describe('route access guards', () => {
  it('resolves and attaches tenant context from an authenticated session request', () => {
    const request: GarageOsRouteAccessRequest = {
      garageOsAuthenticatedSession: createAuthenticatedSession(),
    };

    const guard = new TenantContextRouteGuard();

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(request.garageOsTenantContext).toEqual(
      expect.objectContaining({
        actorUserId: USER_ID,
        sessionId: SESSION_ID,
        tenantId: TENANT_ID,
        tenantStatus: TENANT_STATUSES.ACTIVE,
        assignedBranchIds: [BRANCH_ID],
        effectivePermissions: ['customers.read', 'job_orders.create'],
      }),
    );
  });

  it('blocks route access when tenant status does not allow the required operation type', () => {
    const request: GarageOsRouteAccessRequest = {
      garageOsTenantContext: createResolvedTenantContext({
        tenantStatus: TENANT_STATUSES.READ_ONLY,
      }),
    };

    const guard = new TenantStatusAccessRouteGuard(
      createReflector({
        [GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.TENANT_STATUS_ACCESS]: {
          operationType: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
        } satisfies Omit<TenantStatusAccessInput, 'context'>,
      }),
    );

    expectApiError(() => guard.canActivate(createExecutionContext(request)), {
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('allows route access when all required permissions are present', () => {
    const request: GarageOsRouteAccessRequest = {
      garageOsTenantContext: createResolvedTenantContext({
        effectivePermissions: ['customers.read', 'customers.update'],
      }),
    };

    const guard = new PermissionAccessRouteGuard(
      createReflector({
        [GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.PERMISSION_ACCESS]: {
          permissions: ['customers.read', 'customers.update'],
          mode: PERMISSION_REQUIREMENT_MODES.ALL,
        },
      }),
    );

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('blocks route access when a required permission is missing', () => {
    const request: GarageOsRouteAccessRequest = {
      garageOsTenantContext: createResolvedTenantContext({
        effectivePermissions: ['customers.read'],
      }),
    };

    const guard = new PermissionAccessRouteGuard(
      createReflector({
        [GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.PERMISSION_ACCESS]: {
          permissions: ['customers.update'],
        },
      }),
    );

    expectApiError(() => guard.canActivate(createExecutionContext(request)), {
      code: API_ERROR_CODES.FORBIDDEN,
    });
  });

  it('allows route access for an assigned branch id from params', () => {
    const request: GarageOsRouteAccessRequest = {
      params: {
        branch_id: BRANCH_ID,
      },
      garageOsTenantContext: createResolvedTenantContext({
        assignedBranchIds: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    };

    const guard = new BranchAccessRouteGuard(
      createReflector({
        [GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.BRANCH_ACCESS]: {
          source: 'param',
          key: 'branch_id',
        },
      }),
    );

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('blocks route access for an unassigned branch id from params', () => {
    const request: GarageOsRouteAccessRequest = {
      params: {
        branch_id: OTHER_BRANCH_ID,
      },
      garageOsTenantContext: createResolvedTenantContext({
        assignedBranchIds: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    };

    const guard = new BranchAccessRouteGuard(
      createReflector({
        [GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.BRANCH_ACCESS]: {
          source: 'param',
          key: 'branch_id',
        },
      }),
    );

    expectApiError(() => guard.canActivate(createExecutionContext(request)), {
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    });
  });
});

function createExecutionContext(request: GarageOsRouteAccessRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

function createReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
}

function createAuthenticatedSession(): TenantContextAuthenticatedSession {
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
  };
}

function createResolvedTenantContext(
  overrides: Partial<ResolvedTenantContext> = {},
): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus: TENANT_STATUSES.ACTIVE,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: [BRANCH_ID],
    tenantWideBranchAccess: false,
    effectivePermissions: ['customers.read', 'job_orders.create'],
    emailVerified: true,
    platformSupportAccessSessionId: null,
    ...overrides,
  };
}

function expectApiError(action: () => unknown, expected: { readonly code: string }): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(expected.code);
    return;
  }

  throw new Error(`Expected ${expected.code} error.`);
}
