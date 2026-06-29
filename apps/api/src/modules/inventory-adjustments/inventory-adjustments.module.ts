import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { InventoryAdjustmentsController } from './api/inventory-adjustments.controller';
import { ApproveInventoryAdjustmentService } from './application/approve-inventory-adjustment.service';
import { InventoryAdjustmentApprovalPolicy } from './application/inventory-adjustment-approval-policy';
import { InventoryAdjustmentNumberService } from './application/inventory-adjustment-number.service';
import { InventoryAdjustmentValueImpactService } from './application/inventory-adjustment-value-impact.service';
import { CreateInventoryAdjustmentService } from './application/create-inventory-adjustment.service';
import { RejectInventoryAdjustmentService } from './application/reject-inventory-adjustment.service';
import { SubmitInventoryAdjustmentService } from './application/submit-inventory-adjustment.service';
import { INVENTORY_ADJUSTMENT_PROVIDERS } from './inventory-adjustment.providers';

@Module({
  imports: [AuthModule, DatabaseModule, IdempotencyModule, InventoryModule, ProductsModule],
  controllers: [InventoryAdjustmentsController],
  providers: [
    CreateInventoryAdjustmentService,
    SubmitInventoryAdjustmentService,
    ApproveInventoryAdjustmentService,
    RejectInventoryAdjustmentService,
    InventoryAdjustmentValueImpactService,
    InventoryAdjustmentApprovalPolicy,
    InventoryAdjustmentNumberService,
    ...INVENTORY_ADJUSTMENT_PROVIDERS,
  ],
  exports: [
    ...INVENTORY_ADJUSTMENT_PROVIDERS,
    CreateInventoryAdjustmentService,
    SubmitInventoryAdjustmentService,
    ApproveInventoryAdjustmentService,
    RejectInventoryAdjustmentService,
  ],
})
export class InventoryAdjustmentsModule {}
