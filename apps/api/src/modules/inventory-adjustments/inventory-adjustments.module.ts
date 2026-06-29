import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { INVENTORY_ADJUSTMENT_PROVIDERS } from './inventory-adjustment.providers';

@Module({
  imports: [DatabaseModule],
  providers: [...INVENTORY_ADJUSTMENT_PROVIDERS],
  exports: [...INVENTORY_ADJUSTMENT_PROVIDERS],
})
export class InventoryAdjustmentsModule {}
