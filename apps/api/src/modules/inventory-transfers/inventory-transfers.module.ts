import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branches/branch.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { InventoryTransfersController } from './api/inventory-transfers.controller';
import { CancelInventoryTransferService } from './application/cancel-inventory-transfer.service';
import { CreateInventoryTransferService } from './application/create-inventory-transfer.service';
import { InventoryTransferNumberService } from './application/inventory-transfer-number.service';
import { ReceiveInventoryTransferService } from './application/receive-inventory-transfer.service';
import { SendInventoryTransferService } from './application/send-inventory-transfer.service';
import { SubmitInventoryTransferService } from './application/submit-inventory-transfer.service';
import { INVENTORY_TRANSFER_PROVIDERS } from './inventory-transfer.providers';

@Module({
  imports: [
    AuditModule,
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
    CancelInventoryTransferService,
    InventoryTransferNumberService,
    ReceiveInventoryTransferService,
    SendInventoryTransferService,
    SubmitInventoryTransferService,
    ...INVENTORY_TRANSFER_PROVIDERS,
  ],
  exports: [
    CreateInventoryTransferService,
    CancelInventoryTransferService,
    ReceiveInventoryTransferService,
    SendInventoryTransferService,
    SubmitInventoryTransferService,
    ...INVENTORY_TRANSFER_PROVIDERS,
  ],
})
export class InventoryTransfersModule {}
