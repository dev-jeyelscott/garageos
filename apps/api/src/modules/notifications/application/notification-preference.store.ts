import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  NotificationChannel,
  NotificationType,
} from '../api/notification-preferences.schemas';
import type { PlanChannelLimits } from '../../reminders/domain/reminder-rules';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface NotificationPreferenceRecord {
  readonly notificationType: NotificationType;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly updatedAt: Date;
}

export interface ReplaceNotificationPreferencesInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly preferences: readonly NotificationPreferenceRecord[];
  readonly updatedAt: Date;
}

export abstract class NotificationPreferenceStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract getEffectivePlanChannelLimits(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlanChannelLimits>;

  abstract listForUser(
    tenantId: string,
    userId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly NotificationPreferenceRecord[]>;

  abstract replaceForUser(
    input: ReplaceNotificationPreferencesInput,
    client: DatabaseQueryClient,
  ): Promise<readonly NotificationPreferenceRecord[]>;
}
