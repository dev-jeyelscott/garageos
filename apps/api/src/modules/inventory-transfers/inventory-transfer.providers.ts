import { InventoryTransferStore } from './application/inventory-transfer.store';
import { PostgresInventoryTransferStore } from './persistence/postgres-inventory-transfer.store';

export const INVENTORY_TRANSFER_PROVIDERS = [
  {
    provide: InventoryTransferStore,
    useClass: PostgresInventoryTransferStore,
  },
] as const;
