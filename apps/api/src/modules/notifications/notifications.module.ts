import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './api/notifications.controller';
import { NotificationPreferencesService } from './application/notification-preferences.service';
import { NOTIFICATION_PROVIDERS } from './notification.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationPreferencesService, ...NOTIFICATION_PROVIDERS],
})
export class NotificationsModule {}
