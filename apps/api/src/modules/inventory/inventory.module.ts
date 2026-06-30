import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryLowStockAlertsController } from './api/inventory-low-stock-alerts.controller';
import { InventoryReadController } from './api/inventory-read.controller';
import { InventoryStockBalancesController } from './api/inventory-stock-balances.controller';
import { FifoConsumptionService } from './application/fifo-consumption.service';
import { FifoLayerService } from './application/fifo-layer.service';
import { InventoryLedgerService } from './application/inventory-ledger.service';
import { InventoryReadService } from './application/inventory-read.service';
import { InventoryReconciliationService } from './application/inventory-reconciliation.service';
import { InventoryReservationService } from './application/inventory-reservation.service';
import { InventoryStockBalancesService } from './application/inventory-stock-balances.service';
import { LowStockAlertService } from './application/low-stock-alert.service';
import { INVENTORY_PROVIDERS } from './inventory.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule],
  controllers: [
    InventoryStockBalancesController,
    InventoryLowStockAlertsController,
    InventoryReadController,
  ],
  providers: [
    InventoryStockBalancesService,
    LowStockAlertService,
    InventoryLedgerService,
    FifoConsumptionService,
    InventoryReadService,
    InventoryReconciliationService,
    FifoLayerService,
    InventoryReservationService,
    ...INVENTORY_PROVIDERS,
  ],
  exports: [
    InventoryStockBalancesService,
    LowStockAlertService,
    InventoryLedgerService,
    FifoConsumptionService,
    InventoryReadService,
    InventoryReconciliationService,
    FifoLayerService,
    InventoryReservationService,
  ],
})
export class InventoryModule {}
