import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { InventoryStockBalancesService } from '../application/inventory-stock-balances.service';
import {
  listStockBalancesQuerySchema,
  type ListStockBalancesQuery,
} from './inventory-stock-balances.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('inventory/stock-balances')
export class InventoryStockBalancesController {
  constructor(
    private readonly authService: AuthService,
    private readonly stockBalancesService: InventoryStockBalancesService,
  ) {}

  @Get()
  async listStockBalances(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listStockBalancesQuerySchema))
    query: ListStockBalancesQuery,
  ): ReturnType<InventoryStockBalancesService['listStockBalances']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.stockBalancesService.listStockBalances(query, session.tenantContextSession);
  }
}
