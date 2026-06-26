import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_CONTEXT_USER_TYPES,
  TENANT_STATUSES,
} from '../../../shared/tenant-context/tenant-context';
import type { AuthSessionResponseData } from '../contracts';
import type { AuthService } from '../application/auth.service';
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

    const guard = new AccessTokenAuthGuard(authService);

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(authService.getAuthenticatedRouteSession).toHaveBeenCalledWith('Bearer access-token');
    expect(request.garageOsAuthSessionResponse?.user.id).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(request.garageOsAuthenticatedSession?.actor.session_id).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
  });
});

function createExecutionContext(request: GarageOsAuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
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
