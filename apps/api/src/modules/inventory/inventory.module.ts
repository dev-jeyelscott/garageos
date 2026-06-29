import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryReadController } from './api/inventory-read.controller';
import { InventoryStockBalancesController } from './api/inventory-stock-balances.controller';
import { FifoLayerService } from './application/fifo-layer.service';
import { InventoryLedgerService } from './application/inventory-ledger.service';
import { InventoryReadService } from './application/inventory-read.service';
import { InventoryReconciliationService } from './application/inventory-reconciliation.service';
import { InventoryReservationService } from './application/inventory-reservation.service';
import { InventoryStockBalancesService } from './application/inventory-stock-balances.service';
import { INVENTORY_PROVIDERS } from './inventory.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule],
  controllers: [InventoryStockBalancesController, InventoryReadController],
  providers: [
    InventoryStockBalancesService,
    InventoryLedgerService,
    InventoryReadService,
    InventoryReconciliationService,
    FifoLayerService,
    InventoryReservationService,
    ...INVENTORY_PROVIDERS,
  ],
  exports: [
    InventoryStockBalancesService,
    InventoryLedgerService,
    InventoryReadService,
    InventoryReconciliationService,
    FifoLayerService,
    InventoryReservationService,
  ],
})
export class InventoryModule {}
