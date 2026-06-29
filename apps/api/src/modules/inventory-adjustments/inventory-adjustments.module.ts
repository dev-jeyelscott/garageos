import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { InventoryAdjustmentsController } from './api/inventory-adjustments.controller';
import { InventoryAdjustmentApprovalPolicy } from './application/inventory-adjustment-approval-policy';
import { InventoryAdjustmentNumberService } from './application/inventory-adjustment-number.service';
import { InventoryAdjustmentValueImpactService } from './application/inventory-adjustment-value-impact.service';
import { CreateInventoryAdjustmentService } from './application/create-inventory-adjustment.service';
import { INVENTORY_ADJUSTMENT_PROVIDERS } from './inventory-adjustment.providers';

@Module({
  imports: [AuthModule, DatabaseModule, IdempotencyModule, InventoryModule, ProductsModule],
  controllers: [InventoryAdjustmentsController],
  providers: [
    CreateInventoryAdjustmentService,
    InventoryAdjustmentValueImpactService,
    InventoryAdjustmentApprovalPolicy,
    InventoryAdjustmentNumberService,
    ...INVENTORY_ADJUSTMENT_PROVIDERS,
  ],
  exports: [...INVENTORY_ADJUSTMENT_PROVIDERS, CreateInventoryAdjustmentService],
})
export class InventoryAdjustmentsModule {}
