import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type { UpdateNotificationPreferencesRequest } from '../api/notification-preferences.schemas';
import { updateNotificationPreferencesRequestSchema } from '../api/notification-preferences.schemas';
import {
  NotificationPreferenceStore,
  type NotificationPreferenceRecord,
  type ReplaceNotificationPreferencesInput,
} from './notification-preference.store';
import { NotificationPreferencesService } from './notification-preferences.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = new Date('2026-07-08T00:00:00.000Z');

describe('NotificationPreferencesService', () => {
  it('requires notifications.read permission for non-owner preference reads', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(service.getPreferences(createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'notifications.read' }],
    });
  });

  it('allows active shop owners to read preferences through the owner bypass', async () => {
    const { service, store } = createService();
    store.isOwner = true;

    await expect(service.getPreferences(createTenantSession([]))).resolves.toEqual({
      preferences: [],
    });
  });

  it('returns current user notification preferences', async () => {
    const { service, store } = createService();
    store.preferences = [
      {
        notificationType: 'low_stock',
        channel: 'in_app',
        enabled: true,
        updatedAt: UPDATED_AT,
      },
    ];

    const response = await service.getPreferences(createTenantSession(['notifications.read']));

    expect(store.listInputs[0]).toEqual({
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(response.preferences).toEqual([
      {
        notification_type: 'low_stock',
        channel: 'in_app',
        enabled: true,
        updated_at: UPDATED_AT.toISOString(),
      },
    ]);
  });

  it('requires notifications.update_preferences permission for non-owner updates', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(
      service.updatePreferences(createUpdateRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'notifications.update_preferences' }],
    });
  });

  it('allows active shop owners to update preferences through the owner bypass', async () => {
    const { service, store } = createService();
    store.isOwner = true;

    await expect(
      service.updatePreferences(createUpdateRequest(), createTenantSession([])),
    ).resolves.toMatchObject({
      preferences: [
        {
          notification_type: 'low_stock',
          channel: 'in_app',
          enabled: true,
        },
      ],
    });
  });

  it('blocks enabled channels that are not available on the tenant plan', async () => {
    const { service, store } = createService();
    store.planLimits = {
      in_app_notifications: true,
      push_notifications: true,
      email_notifications: false,
      sms_notifications: false,
    };

    await expect(
      service.updatePreferences(
        createUpdateRequest({
          preferences: [
            {
              notification_type: 'low_stock',
              channel: 'email',
              enabled: true,
            },
          ],
        }),
        createTenantSession(['notifications.update_preferences']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.PLAN_LIMIT_EXCEEDED,
    });
  });

  it('allows disabling channels even when the tenant plan blocks the channel', async () => {
    const { service, store } = createService();
    store.planLimits = {
      in_app_notifications: true,
      email_notifications: false,
    };

    const response = await service.updatePreferences(
      createUpdateRequest({
        preferences: [
          {
            notification_type: 'low_stock',
            channel: 'email',
            enabled: false,
          },
        ],
      }),
      createTenantSession(['notifications.update_preferences']),
    );

    expect(store.replaceInputs[0]?.preferences).toEqual([
      {
        notificationType: 'low_stock',
        channel: 'email',
        enabled: false,
        updatedAt: expect.any(Date),
      },
    ]);
    expect(response.preferences).toEqual([
      {
        notification_type: 'low_stock',
        channel: 'email',
        enabled: false,
        updated_at: expect.any(String),
      },
    ]);
  });

  it('blocks preference updates in read-only tenant status', async () => {
    const { service } = createService();

    await expect(
      service.updatePreferences(
        createUpdateRequest(),
        createTenantSession(['notifications.update_preferences'], {
          tenantStatus: 'read_only',
        }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('rejects duplicate notification type and channel entries at request validation', () => {
    const result = updateNotificationPreferencesRequestSchema.safeParse({
      preferences: [
        {
          notification_type: 'low_stock',
          channel: 'in_app',
          enabled: true,
        },
        {
          notification_type: 'low_stock',
          channel: 'in_app',
          enabled: false,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Duplicate notification preference.');
  });
});

function createService(): {
  readonly service: NotificationPreferencesService;
  readonly store: FakeNotificationPreferenceStore;
} {
  const store = new FakeNotificationPreferenceStore();
  const auditService = {
    record: vi.fn(async () => ({
      id: 'audit-id',
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      actorType: 'tenant_user',
      supportAccessSessionId: null,
      action: 'notifications.preferences_updated',
      entityType: 'user_notification_preferences',
      entityId: USER_ID,
      branchId: null,
      beforeJson: null,
      afterJson: null,
      metadataJson: null,
      reason: 'notification_preferences_updated',
      ipAddress: null,
      userAgent: null,
      retentionClass: 'standard_3_year',
      createdAt: UPDATED_AT,
    })),
  } as unknown as AuditService;

  return {
    service: new NotificationPreferencesService(store, new FakeTransactionRunner(), auditService),
    store,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantStatus?: TenantStatus;
  } = {},
): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: TENANT_ID,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: overrides.tenantStatus ?? 'active',
    },
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}

function createUpdateRequest(
  overrides: Partial<UpdateNotificationPreferencesRequest> = {},
): UpdateNotificationPreferencesRequest {
  return {
    preferences: [
      {
        notification_type: 'low_stock',
        channel: 'in_app',
        enabled: true,
      },
    ],
    ...overrides,
  };
}

class FakeNotificationPreferenceStore extends NotificationPreferenceStore {
  isOwner = false;
  preferences: NotificationPreferenceRecord[] = [];
  planLimits: Record<string, boolean | number | string | null> = {
    in_app_notifications: true,
    push_notifications: true,
    email_notifications: true,
    sms_notifications: true,
  };
  listInputs: Array<{ tenantId: string; userId: string }> = [];
  replaceInputs: ReplaceNotificationPreferencesInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async getEffectivePlanChannelLimits(): Promise<Record<string, boolean | number | string | null>> {
    return this.planLimits;
  }

  async listForUser(
    tenantId: string,
    userId: string,
  ): Promise<readonly NotificationPreferenceRecord[]> {
    this.listInputs.push({ tenantId, userId });
    return this.preferences;
  }

  async replaceForUser(
    input: ReplaceNotificationPreferencesInput,
  ): Promise<readonly NotificationPreferenceRecord[]> {
    this.replaceInputs.push(input);
    this.preferences = [...input.preferences];
    return this.preferences;
  }
}

class FakeTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({ query: vi.fn() });
  }
}
