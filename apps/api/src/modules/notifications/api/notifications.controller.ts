import { Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { NotificationPreferencesService } from '../application/notification-preferences.service';
import { InAppNotificationsService } from '../application/in-app-notifications.service';
import {
  type UpdateNotificationPreferencesRequest,
  updateNotificationPreferencesRequestSchema,
} from './notification-preferences.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
    private readonly inAppNotificationsService: InAppNotificationsService,
  ) {}

  @Get('preferences')
  async getPreferences(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<NotificationPreferencesService['getPreferences']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.notificationPreferencesService.getPreferences(session.tenantContextSession);
  }

  @Get()
  async list(@Headers('authorization') authorizationHeader: string | undefined) {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    return this.inAppNotificationsService.list(session.tenantContextSession);
  }

  @Post(':notificationId/read')
  async markRead(
    @Param('notificationId') id: string,
    @Headers('authorization') authorizationHeader: string | undefined,
  ) {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    return this.inAppNotificationsService.markRead(id, session.tenantContextSession);
  }

  @Post(':notificationId/dismiss')
  async dismiss(
    @Param('notificationId') id: string,
    @Headers('authorization') authorizationHeader: string | undefined,
  ) {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    return this.inAppNotificationsService.dismiss(id, session.tenantContextSession);
  }

  @Put('preferences')
  async updatePreferences(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body(new ZodValidationPipe(updateNotificationPreferencesRequestSchema))
    request: UpdateNotificationPreferencesRequest,
  ): ReturnType<NotificationPreferencesService['updatePreferences']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.notificationPreferencesService.updatePreferences(
      request,
      session.tenantContextSession,
    );
  }
}
