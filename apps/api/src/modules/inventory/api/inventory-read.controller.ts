import { Controller, Get, Headers, Param, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { InventoryReadService } from '../application/inventory-read.service';
import {
  listInventoryLedgerQuerySchema,
  type ListInventoryLedgerQuery,
  productFifoLayersQuerySchema,
  type ProductFifoLayersQuery,
  productInventoryStockQuerySchema,
  type ProductInventoryStockQuery,
} from './inventory-read.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller()
export class InventoryReadController {
  constructor(
    private readonly authService: AuthService,
    private readonly inventoryReadService: InventoryReadService,
  ) {}

  @Get('products/:product_id/stock')
  async listProductStock(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('product_id') productId: string,
    @Query(new ZodValidationPipe(productInventoryStockQuerySchema))
    query: ProductInventoryStockQuery,
  ): ReturnType<InventoryReadService['listProductStock']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.inventoryReadService.listProductStock(
      productId,
      query,
      session.tenantContextSession,
    );
  }

  @Get('products/:product_id/fifo-layers')
  async listProductFifoLayers(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('product_id') productId: string,
    @Query(new ZodValidationPipe(productFifoLayersQuerySchema))
    query: ProductFifoLayersQuery,
  ): ReturnType<InventoryReadService['listProductFifoLayers']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.inventoryReadService.listProductFifoLayers(
      productId,
      query,
      session.tenantContextSession,
    );
  }

  @Get('inventory/ledger')
  async listInventoryLedgerEntries(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listInventoryLedgerQuerySchema))
    query: ListInventoryLedgerQuery,
  ): ReturnType<InventoryReadService['listInventoryLedgerEntries']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.inventoryReadService.listInventoryLedgerEntries(
      query,
      session.tenantContextSession,
    );
  }
}
