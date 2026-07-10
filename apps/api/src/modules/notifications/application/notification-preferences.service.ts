import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertPermissionAccessAllowed } from '../../../shared/authorization/permission-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import {
  assertNotificationChannelsAllowedByPlan,
  PlanChannelLimitError,
  type NotificationChannel,
} from '../../reminders/domain/reminder-rules';
import type { UpdateNotificationPreferencesRequest } from '../api/notification-preferences.schemas';
import {
  NotificationPreferenceStore,
  type NotificationPreferenceRecord,
} from './notification-preference.store';

export interface NotificationPreferenceResponseItem {
  readonly notification_type: string;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly updated_at: string;
}

export interface NotificationPreferencesResponse {
  readonly preferences: readonly NotificationPreferenceResponseItem[];
}

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @Inject(NotificationPreferenceStore)
    private readonly preferenceStore: NotificationPreferenceStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getPreferences(
    session: TenantContextAuthenticatedSession,
  ): Promise<NotificationPreferencesResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.preferenceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertNotificationPermission(context, isShopOwner, 'notifications.read');

    const preferences = await this.preferenceStore.listForUser(
      context.tenantId,
      context.actorUserId,
    );

    return {
      preferences: preferences.map(toPreferenceResponseItem),
    };
  }

  async updatePreferences(
    request: UpdateNotificationPreferencesRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<NotificationPreferencesResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.preferenceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertNotificationPermission(context, isShopOwner, 'notifications.update_preferences');

    const enabledChannels = request.preferences
      .filter((preference) => preference.enabled)
      .map((preference) => preference.channel);
    const limits = await this.preferenceStore.getEffectivePlanChannelLimits(context.tenantId);

    try {
      assertNotificationChannelsAllowedByPlan(enabledChannels, limits);
    } catch (error) {
      if (error instanceof PlanChannelLimitError) {
        throw GarageOsApiException.planLimitExceeded(error.message);
      }

      throw error;
    }

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const before = await this.preferenceStore.listForUser(
        context.tenantId,
        context.actorUserId,
        transaction,
      );
      const updatedAt = new Date();
      const after = await this.preferenceStore.replaceForUser(
        {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          preferences: request.preferences.map((preference) => ({
            notificationType: preference.notification_type,
            channel: preference.channel,
            enabled: preference.enabled,
            updatedAt,
          })),
          updatedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'notifications.preferences_updated',
        entityType: 'user_notification_preferences',
        entityId: context.actorUserId,
        beforeJson: toPreferenceAuditJson(before),
        afterJson: toPreferenceAuditJson(after),
        reason: 'notification_preferences_updated',
        client: transaction,
      });

      return {
        preferences: after.map(toPreferenceResponseItem),
      };
    });
  }
}

function assertNotificationPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  // Notification preferences are tenant-user scoped; branch access is enforced when a
  // notification operation reads or mutates a branch-specific record.
  if (isShopOwner) {
    return;
  }

  assertPermissionAccessAllowed({
    context,
    requirement: {
      permissions: [permission],
    },
  });
}

function toPreferenceResponseItem(
  preference: NotificationPreferenceRecord,
): NotificationPreferenceResponseItem {
  return {
    notification_type: preference.notificationType,
    channel: preference.channel,
    enabled: preference.enabled,
    updated_at: preference.updatedAt.toISOString(),
  };
}

function toPreferenceAuditJson(preferences: readonly NotificationPreferenceRecord[]): unknown {
  return preferences.map((preference) => ({
    notification_type: preference.notificationType,
    channel: preference.channel,
    enabled: preference.enabled,
  }));
}
