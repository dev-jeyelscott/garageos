import { FifoLayerStore } from './application/fifo-layer.store';
import { InventoryLedgerStore } from './application/inventory-ledger.store';
import { StockBalanceStore } from './application/stock-balance.store';
import { PostgresFifoLayerRepository } from './persistence/postgres-fifo-layer.repository';
import { PostgresInventoryLedgerRepository } from './persistence/postgres-inventory-ledger.repository';
import { PostgresStockBalanceRepository } from './persistence/postgres-stock-balance.repository';

export const INVENTORY_PROVIDERS = [
  {
    provide: StockBalanceStore,
    useClass: PostgresStockBalanceRepository,
  },
  {
    provide: InventoryLedgerStore,
    useClass: PostgresInventoryLedgerRepository,
  },
  {
    provide: FifoLayerStore,
    useClass: PostgresFifoLayerRepository,
  },
] as const;
