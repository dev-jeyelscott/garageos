import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { LowStockAlertService } from '../application/low-stock-alert.service';
import {
  listLowStockAlertsQuerySchema,
  type ListLowStockAlertsQuery,
} from './inventory-low-stock-alerts.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('inventory/low-stock-alerts')
export class InventoryLowStockAlertsController {
  constructor(
    private readonly authService: AuthService,
    private readonly lowStockAlertService: LowStockAlertService,
  ) {}

  @Get()
  async listLowStockAlerts(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listLowStockAlertsQuerySchema))
    query: ListLowStockAlertsQuery,
  ): ReturnType<LowStockAlertService['listActiveAlerts']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.lowStockAlertService.listActiveAlerts(query, session.tenantContextSession);
  }
}
