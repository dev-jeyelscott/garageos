import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { AuthSessionResponseData } from '../../auth/contracts';
import {
  PLATFORM_PERMISSIONS,
  type PlatformAuditLogListResponse,
  type PlatformTenantService,
} from '../application/platform-tenant.service';
import { PlatformTenantController } from './platform-tenant.controller';

const PLATFORM_ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';

describe('PlatformTenantController audit logs', () => {
  it('delegates GET /platform/audit-logs without idempotency', async () => {
    const response: PlatformAuditLogListResponse = {
      audit_logs: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
          tenant_id: TENANT_ID,
          action: 'platform.tenant_export.queued',
          entity_type: 'background_job',
          entity_id: '44444444-4444-4444-8444-444444444444',
          metadata_json: {
            tenant_status: 'active',
          },
          ip_address: '127.0.0.1',
          user_agent: 'vitest',
          created_at: '2026-06-27T00:00:00.000Z',
        },
      ],
      pagination: {
        limit: 50,
        next_cursor: null,
        has_more: false,
      },
    };

    const service = {
      listAuditLogs: vi.fn(async () => response),
    } as unknown as PlatformTenantService;

    const idempotencyService = {
      begin: vi.fn(),
    } as unknown as IdempotencyService;

    const controller = new PlatformTenantController(service, idempotencyService);
    const query = {
      limit: 50,
      actor: PLATFORM_ADMIN_USER_ID,
      action: 'platform.tenant_export.queued',
      tenant_id: TENANT_ID,
      from: '2026-06-27T00:00:00.000Z',
      to: '2026-06-28T00:00:00.000Z',
    };
    const session = createPlatformSession([PLATFORM_PERMISSIONS.AUDIT_LOGS_READ]);

    await expect(controller.listAuditLogs(query, session)).resolves.toEqual(response);

    expect(service.listAuditLogs).toHaveBeenCalledWith(query, session);
    expect(idempotencyService.begin).not.toHaveBeenCalled();
  });

  it('surfaces missing platform.audit_logs.read from the service layer', async () => {
    const error = GarageOsApiException.forbidden(PLATFORM_PERMISSIONS.AUDIT_LOGS_READ);
    const service = {
      listAuditLogs: vi.fn(async () => {
        throw error;
      }),
    } as unknown as PlatformTenantService;

    const controller = new PlatformTenantController(service, {
      begin: vi.fn(),
    } as unknown as IdempotencyService);

    await expect(
      controller.listAuditLogs(
        {
          limit: 50,
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [
        {
          required_permission: PLATFORM_PERMISSIONS.AUDIT_LOGS_READ,
        },
      ],
    });
  });
});

function createPlatformSession(permissions: readonly string[]): AuthSessionResponseData {
  return {
    user: {
      id: PLATFORM_ADMIN_USER_ID,
      user_type: 'platform_admin',
      full_name: 'Platform Admin',
      email: 'admin@garageos.test',
      email_verified: true,
      status: 'active',
    },
    tenant: null,
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: false,
    effective_plan: null,
    subscription: null,
    access: {
      can_access_operational_modules: false,
      read_only: false,
    },
  };
}
