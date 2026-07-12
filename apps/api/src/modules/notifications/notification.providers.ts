import { NotificationPreferenceStore } from './application/notification-preference.store';
import { PostgresNotificationPreferenceRepository } from './persistence/postgres-notification-preference.repository';
import { InAppNotificationStore } from './application/in-app-notification.store';
import { PostgresInAppNotificationRepository } from './persistence/postgres-in-app-notification.repository';

export const NOTIFICATION_PROVIDERS = [
  {
    provide: NotificationPreferenceStore,
    useClass: PostgresNotificationPreferenceRepository,
  },
  { provide: InAppNotificationStore, useClass: PostgresInAppNotificationRepository },
] as const;
