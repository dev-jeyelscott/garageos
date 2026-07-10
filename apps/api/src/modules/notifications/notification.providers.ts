import { NotificationPreferenceStore } from './application/notification-preference.store';
import { PostgresNotificationPreferenceRepository } from './persistence/postgres-notification-preference.repository';

export const NOTIFICATION_PROVIDERS = [
  {
    provide: NotificationPreferenceStore,
    useClass: PostgresNotificationPreferenceRepository,
  },
] as const;
