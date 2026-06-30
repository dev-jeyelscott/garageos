import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import type { AuditService } from '../audit/audit.service';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
} from '../tenant-context/tenant-context';
import {
  TENANT_ACCESS_OPERATION_TYPES,
  type TenantAccessOperationType,
} from '../tenant-context/tenant-status-access';
import { TenantStatusAccessRouteGuard } from '../tenant-context/tenant-status-access-route.guard';
import { BranchAccessRouteGuard } from './branch-access-route.guard';
import {
  PERMISSION_REQUIREMENT_MODES,
  type PermissionAccessRequirement,
} from './permission-access';
import { PermissionAccessRouteGuard } from './permission-access-route.guard';
import type { GarageOsRouteAccessRequest } from './route-access-context';
import type {
  BranchAccessRouteRequirement,
  TenantStatusAccessRouteRequirement,
} from './route-access.decorators';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNED_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const DENIED_BRANCH_ID = '55555555-5555-4555-8555-555555555555';
const SUPPORT_ACCESS_SESSION_ID = '66666666-6666-4666-8666-666666666666';

describe('Route access security guards', () => {
  it('allows permission access when any required permission is granted without recording denial audit logs', async () => {
    const { guard, auditService } = createPermissionGuard({
      permissions: ['invoices.read', 'payments.read'],
      mode: PERMISSION_REQUIREMENT_MODES.ANY,
    });
    const request = createRequest({
      context: {
        effectivePermissions: ['payments.read'],
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('audits permission denials with required and missing permission metadata', async () => {
    const { guard, auditService } = createPermissionGuard({
      permissions: ['invoices.issue'],
    });
    const request = createRequest({
      context: {
        effectivePermissions: ['invoices.read'],
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
        supportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
        action: 'access.permission_denied',
        entityType: 'permission',
        reason: 'required_permission_access_is_missing',
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
        metadataJson: expect.objectContaining({
          mode: PERMISSION_REQUIREMENT_MODES.ALL,
          required_permissions: ['invoices.issue'],
          granted_permissions: [],
          missing_permissions: ['invoices.issue'],
          reason: 'required_permission_access_is_missing',
        }),
      }),
    );
  });

  it('allows assigned branch access without recording denial audit logs', async () => {
    const { guard, auditService } = createBranchGuard({
      source: 'body',
      key: 'branch_id',
    });
    const request = createRequest({
      body: {
        branch_id: ASSIGNED_BRANCH_ID,
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('audits missing branch IDs before blocking branch access', async () => {
    const { guard, auditService } = createBranchGuard({
      source: 'body',
      key: 'branch_id',
    });
    const request = createRequest({
      body: {},
    });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
        supportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
        action: 'access.branch_denied',
        entityType: 'branch',
        reason: 'branch_id_missing',
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
        metadataJson: {
          branch_id_source: 'body',
          branch_id_key: 'branch_id',
          reason: 'branch_id_missing',
        },
      }),
    );
  });

  it('audits branch denials with assigned branch metadata', async () => {
    const { guard, auditService } = createBranchGuard({
      source: 'param',
      key: 'branch_id',
    });
    const request = createRequest({
      params: {
        branch_id: DENIED_BRANCH_ID,
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
        supportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
        action: 'access.branch_denied',
        entityType: 'branch',
        branchId: DENIED_BRANCH_ID,
        reason: 'assigned_branch_access_is_missing',
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
        metadataJson: expect.objectContaining({
          branch_id: DENIED_BRANCH_ID,
          assigned_branch_ids: [ASSIGNED_BRANCH_ID],
          tenant_wide_branch_access: false,
          reason: 'assigned_branch_access_is_missing',
        }),
      }),
    );
  });

  it('allows suspended shop owner export access without recording denial audit logs', async () => {
    const { guard, auditService } = createTenantStatusGuard(
      TENANT_ACCESS_OPERATION_TYPES.EXPORT_DATA,
      {
        actorIsShopOwner: true,
      },
    );
    const request = createRequest({
      context: {
        tenantStatus: TENANT_STATUSES.SUSPENDED,
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('audits read-only tenant operational write denials', async () => {
    const { guard, auditService } = createTenantStatusGuard(
      TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
    );
    const request = createRequest({
      context: {
        tenantStatus: TENANT_STATUSES.READ_ONLY,
      },
    });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
        supportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
        action: 'access.tenant_status_denied',
        entityType: 'tenant',
        entityId: TENANT_ID,
        reason: 'read_only_blocks_operational_writes',
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
        metadataJson: {
          tenant_status: TENANT_STATUSES.READ_ONLY,
          operation_type: TENANT_ACCESS_OPERATION_TYPES.OPERATIONAL_WRITE,
          subscription_status_source: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
          reason: 'read_only_blocks_operational_writes',
        },
      }),
    );
  });
});

function createPermissionGuard(requirement: PermissionAccessRequirement): {
  readonly guard: PermissionAccessRouteGuard;
  readonly auditService: ReturnType<typeof createAuditService>;
} {
  const auditService = createAuditService();

  return {
    guard: new PermissionAccessRouteGuard(
      createReflector(requirement),
      auditService as unknown as AuditService,
    ),
    auditService,
  };
}

function createBranchGuard(requirement: BranchAccessRouteRequirement): {
  readonly guard: BranchAccessRouteGuard;
  readonly auditService: ReturnType<typeof createAuditService>;
} {
  const auditService = createAuditService();

  return {
    guard: new BranchAccessRouteGuard(
      createReflector(requirement),
      auditService as unknown as AuditService,
    ),
    auditService,
  };
}

function createTenantStatusGuard(
  operationType: TenantAccessOperationType,
  options: { readonly actorIsShopOwner?: boolean } = {},
): {
  readonly guard: TenantStatusAccessRouteGuard;
  readonly auditService: ReturnType<typeof createAuditService>;
} {
  const auditService = createAuditService();
  const requirement: TenantStatusAccessRouteRequirement =
    options.actorIsShopOwner === undefined
      ? { operationType }
      : { operationType, actorIsShopOwner: options.actorIsShopOwner };

  return {
    guard: new TenantStatusAccessRouteGuard(
      createReflector(requirement),
      auditService as unknown as AuditService,
    ),
    auditService,
  };
}

function createReflector<T>(requirement: T): Reflector {
  return {
    getAllAndOverride: vi.fn(() => requirement),
  } as unknown as Reflector;
}

function createAuditService(): {
  readonly record: ReturnType<typeof vi.fn>;
} {
  return {
    record: vi.fn(async () => undefined),
  };
}

function createRequest(
  options: {
    readonly context?: Partial<ResolvedTenantContext>;
    readonly headers?: Record<string, string | readonly string[] | undefined>;
    readonly params?: Record<string, string | undefined>;
    readonly query?: Record<string, string | readonly string[] | undefined>;
    readonly body?: unknown;
  } = {},
): GarageOsRouteAccessRequest {
  return {
    headers: {
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
      'user-agent': 'GarageOS Test Browser',
      ...(options.headers ?? {}),
    },
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    garageOsTenantContext: createTenantContext(options.context),
  };
}

function createTenantContext(
  overrides: Partial<ResolvedTenantContext> = {},
): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus: TENANT_STATUSES.ACTIVE,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: [ASSIGNED_BRANCH_ID],
    tenantWideBranchAccess: false,
    effectivePermissions: ['customers.read'],
    emailVerified: true,
    platformSupportAccessSessionId: SUPPORT_ACCESS_SESSION_ID,
    ...overrides,
  };
}

function createExecutionContext(request: GarageOsRouteAccessRequest): ExecutionContext {
  return {
    getHandler: () => createExecutionContext,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

class TestController {}
