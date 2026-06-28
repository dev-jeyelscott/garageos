import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryStockBalancesController } from './api/inventory-stock-balances.controller';
import { FifoLayerService } from './application/fifo-layer.service';
import { InventoryLedgerService } from './application/inventory-ledger.service';
import { InventoryStockBalancesService } from './application/inventory-stock-balances.service';
import { INVENTORY_PROVIDERS } from './inventory.providers';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InventoryStockBalancesController],
  providers: [
    InventoryStockBalancesService,
    InventoryLedgerService,
    FifoLayerService,
    ...INVENTORY_PROVIDERS,
  ],
  exports: [InventoryStockBalancesService, InventoryLedgerService, FifoLayerService],
})
export class InventoryModule {}
