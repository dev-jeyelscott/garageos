import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branches/branch.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { InventoryTransfersController } from './api/inventory-transfers.controller';
import { CreateInventoryTransferService } from './application/create-inventory-transfer.service';
import { InventoryTransferNumberService } from './application/inventory-transfer-number.service';
import { SubmitInventoryTransferService } from './application/submit-inventory-transfer.service';
import { INVENTORY_TRANSFER_PROVIDERS } from './inventory-transfer.providers';

@Module({
  imports: [
    AuthModule,
    BranchModule,
    DatabaseModule,
    IdempotencyModule,
    InventoryModule,
    ProductsModule,
  ],
  controllers: [InventoryTransfersController],
  providers: [
    CreateInventoryTransferService,
    InventoryTransferNumberService,
    SubmitInventoryTransferService,
    ...INVENTORY_TRANSFER_PROVIDERS,
  ],
  exports: [
    CreateInventoryTransferService,
    SubmitInventoryTransferService,
    ...INVENTORY_TRANSFER_PROVIDERS,
  ],
})
export class InventoryTransfersModule {}
