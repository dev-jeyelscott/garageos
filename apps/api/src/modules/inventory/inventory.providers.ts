import { InventoryLedgerStore } from './application/inventory-ledger.store';
import { StockBalanceStore } from './application/stock-balance.store';
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
] as const;
