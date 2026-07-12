import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { NotificationType } from '../api/notification-preferences.schemas';

export interface InAppNotificationRecord {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly readAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly createdAt: Date;
}

export abstract class InAppNotificationStore {
  abstract isActiveShopOwner(input: { tenantId: string; userId: string }): Promise<boolean>;
  abstract listForUser(
    tenantId: string,
    userId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly InAppNotificationRecord[]>;

  abstract markRead(
    tenantId: string,
    userId: string,
    notificationId: string,
    client?: DatabaseQueryClient,
  ): Promise<InAppNotificationRecord | null>;

  abstract dismiss(
    tenantId: string,
    userId: string,
    notificationId: string,
    client?: DatabaseQueryClient,
  ): Promise<InAppNotificationRecord | null>;
}
