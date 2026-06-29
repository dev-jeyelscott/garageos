import { InventoryAdjustmentStore } from './application/inventory-adjustment.store';
import { PostgresInventoryAdjustmentStore } from './persistence/postgres-inventory-adjustment.store';

export const INVENTORY_ADJUSTMENT_PROVIDERS = [
  {
    provide: InventoryAdjustmentStore,
    useClass: PostgresInventoryAdjustmentStore,
  },
] as const;
