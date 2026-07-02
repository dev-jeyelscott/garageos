import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branches/branch.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PurchaseOrdersController } from './api/purchase-orders.controller';
import { PurchaseOrderDraftService } from './application/purchase-order-draft.service';
import { PurchaseOrderLifecycleService } from './application/purchase-order-lifecycle.service';
import { PurchaseOrderQueryService } from './application/purchase-order-query.service';
import { ReceivePurchaseOrderService } from './application/receive-purchase-order.service';
import { PURCHASE_ORDER_PROVIDERS } from './purchase-order.providers';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    BranchModule,
    DatabaseModule,
    IdempotencyModule,
    InventoryModule,
    ProductsModule,
    SuppliersModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrderDraftService,
    PurchaseOrderLifecycleService,
    PurchaseOrderQueryService,
    ReceivePurchaseOrderService,
    ...PURCHASE_ORDER_PROVIDERS,
  ],
  exports: [
    PurchaseOrderDraftService,
    PurchaseOrderLifecycleService,
    PurchaseOrderQueryService,
    ReceivePurchaseOrderService,
    ...PURCHASE_ORDER_PROVIDERS,
  ],
})
export class PurchaseOrdersModule {}
