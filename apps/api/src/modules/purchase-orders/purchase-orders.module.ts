import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { PurchaseOrdersController } from './api/purchase-orders.controller';
import { ReceivePurchaseOrderService } from './application/receive-purchase-order.service';
import { PURCHASE_ORDER_PROVIDERS } from './purchase-order.providers';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    DatabaseModule,
    IdempotencyModule,
    InventoryModule,
    ProductsModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [ReceivePurchaseOrderService, ...PURCHASE_ORDER_PROVIDERS],
  exports: [ReceivePurchaseOrderService, ...PURCHASE_ORDER_PROVIDERS],
})
export class PurchaseOrdersModule {}
