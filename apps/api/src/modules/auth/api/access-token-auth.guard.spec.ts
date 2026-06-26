import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { AuditService } from '../../../shared/audit/audit.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_CONTEXT_USER_TYPES,
  TENANT_STATUSES,
} from '../../../shared/tenant-context/tenant-context';
import type { AuthService } from '../application/auth.service';
import type { AuthSessionResponseData } from '../contracts';
import { AccessTokenAuthGuard, type GarageOsAuthenticatedRequest } from './access-token-auth.guard';

describe('AccessTokenAuthGuard', () => {
  it('authenticates bearer access tokens and attaches route session contexts to the request', async () => {
    const request: GarageOsAuthenticatedRequest = {
      headers: {
        authorization: 'Bearer access-token',
      },
    };

    const authService = {
      getAuthenticatedRouteSession: vi.fn(async () => ({
        sessionResponse: createSessionResponse(),
        tenantContextSession: createTenantContextSession(),
      })),
    } as unknown as AuthService;
    const auditService = createAuditService();

    const guard = new AccessTokenAuthGuard(authService, auditService);

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(authService.getAuthenticatedRouteSession).toHaveBeenCalledWith('Bearer access-token');
    expect(auditService.record).not.toHaveBeenCalled();
    expect(request.garageOsAuthSessionResponse?.user.id).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(request.garageOsAuthenticatedSession?.actor.session_id).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
  });

  it('audits denied bearer access tokens without storing sensitive authorization data', async () => {
    const request: GarageOsAuthenticatedRequest = {
      headers: {
        authorization: 'Bearer access-token',
        'x-forwarded-for': '203.0.113.10, 198.51.100.20',
        'user-agent': 'GarageOS Test Browser',
      },
    };

    const authService = {
      getAuthenticatedRouteSession: vi.fn(async () => {
        throw GarageOsApiException.unauthenticated('Access token is invalid.');
      }),
    } as unknown as AuthService;
    const auditService = createAuditService();

    const guard = new AccessTokenAuthGuard(authService, auditService);

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toMatchObject({
      code: API_ERROR_CODES.UNAUTHENTICATED,
    });

    expect(authService.getAuthenticatedRouteSession).toHaveBeenCalledWith('Bearer access-token');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        action: 'auth.access_token_denied',
        entityType: 'auth_session',
        metadataJson: {
          error_code: API_ERROR_CODES.UNAUTHENTICATED,
        },
        reason: 'access_token_invalid_or_expired',
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
      }),
    );

    const auditCalls = vi.mocked(auditService.record).mock.calls;
    const [auditInput] = auditCalls[0] ?? [];

    expect(JSON.stringify(auditInput)).not.toContain('Bearer access-token');
    expect(JSON.stringify(auditInput)).not.toContain('access-token');
  });
});

function createExecutionContext(request: GarageOsAuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createAuditService(): AuditService {
  return {
    record: vi.fn(),
  } as unknown as AuditService;
}

function createSessionResponse(): AuthSessionResponseData {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      user_type: 'tenant_user',
      full_name: 'Juan Dela Cruz',
      email: 'owner@example.com',
      email_verified: true,
      status: 'active',
    },
    tenant: {
      id: '22222222-2222-4222-8222-222222222222',
      business_name: 'Moto Garage',
      status: 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    effective_permissions: ['customers.read'],
    branches: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Main Branch',
      },
    ],
    tenant_wide_branch_access: false,
    effective_plan: null,
    subscription: null,
    access: {
      can_access_operational_modules: true,
      read_only: false,
    },
  };
}

function createTenantContextSession(): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: '11111111-1111-4111-8111-111111111111',
      user_type: TENANT_CONTEXT_USER_TYPES.TENANT_USER,
      tenant_id: '22222222-2222-4222-8222-222222222222',
      session_id: '33333333-3333-4333-8333-333333333333',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: '22222222-2222-4222-8222-222222222222',
      status: TENANT_STATUSES.ACTIVE,
    },
    effective_permissions: ['customers.read'],
    branches: [
      {
        id: '44444444-4444-4444-8444-444444444444',
      },
    ],
    tenant_wide_branch_access: false,
    subscription_status_source: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
  };
}
