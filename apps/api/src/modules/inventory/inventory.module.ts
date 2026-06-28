import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryStockBalancesController } from './api/inventory-stock-balances.controller';
import { InventoryStockBalancesService } from './application/inventory-stock-balances.service';
import { INVENTORY_PROVIDERS } from './inventory.providers';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InventoryStockBalancesController],
  providers: [InventoryStockBalancesService, ...INVENTORY_PROVIDERS],
})
export class InventoryModule {}
