import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertPermissionAccessAllowed } from '../../../shared/authorization/permission-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { InAppNotificationStore, type InAppNotificationRecord } from './in-app-notification.store';

export interface InAppNotificationResponse {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly read_at: string | null;
  readonly dismissed_at: string | null;
  readonly created_at: string;
}
export interface InAppNotificationListResponse {
  readonly notifications: readonly InAppNotificationResponse[];
}

@Injectable()
export class InAppNotificationsService {
  constructor(@Inject(InAppNotificationStore) private readonly store: InAppNotificationStore) {}

  async list(session: TenantContextAuthenticatedSession): Promise<InAppNotificationListResponse> {
    const context = await this.resolveAccess(session, 'read');
    return {
      notifications: (await this.store.listForUser(context.tenantId, context.actorUserId)).map(
        toResponse,
      ),
    };
  }

  async markRead(
    id: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<{ notification: InAppNotificationResponse }> {
    return this.mutate(id, session, 'read');
  }

  async dismiss(
    id: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<{ notification: InAppNotificationResponse }> {
    return this.mutate(id, session, 'dismiss');
  }

  private async mutate(
    id: string,
    session: TenantContextAuthenticatedSession,
    action: 'read' | 'dismiss',
  ) {
    const context = await this.resolveAccess(session, 'read');
    const notification =
      action === 'read'
        ? await this.store.markRead(context.tenantId, context.actorUserId, id.trim())
        : await this.store.dismiss(context.tenantId, context.actorUserId, id.trim());
    if (!notification) throw GarageOsApiException.resourceNotFound('Notification was not found.');
    return { notification: toResponse(notification) };
  }

  private async resolveAccess(session: TenantContextAuthenticatedSession, operation: 'read') {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.store.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });
    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    if (!isShopOwner)
      assertPermissionAccessAllowed({
        context,
        requirement: { permissions: [`notifications.${operation}`] },
      });
    return context;
  }
}

function toResponse(record: InAppNotificationRecord): InAppNotificationResponse {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    read_at: record.readAt?.toISOString() ?? null,
    dismissed_at: record.dismissedAt?.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
  };
}
