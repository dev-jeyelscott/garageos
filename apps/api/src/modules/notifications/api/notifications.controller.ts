import { Body, Controller, Get, Headers, Put, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { NotificationPreferencesService } from '../application/notification-preferences.service';
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
  ) {}

  @Get('preferences')
  async getPreferences(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<NotificationPreferencesService['getPreferences']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.notificationPreferencesService.getPreferences(session.tenantContextSession);
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
