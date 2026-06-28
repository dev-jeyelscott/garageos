import { FifoLayerStore } from './application/fifo-layer.store';
import { FifoReservationAllocationStore } from './application/fifo-reservation-allocation.store';
import { InventoryLedgerStore } from './application/inventory-ledger.store';
import { InventoryReservationStore } from './application/inventory-reservation.store';
import { StockBalanceStore } from './application/stock-balance.store';
import { PostgresFifoLayerRepository } from './persistence/postgres-fifo-layer.repository';
import { PostgresFifoReservationAllocationRepository } from './persistence/postgres-fifo-reservation-allocation.repository';
import { PostgresInventoryLedgerRepository } from './persistence/postgres-inventory-ledger.repository';
import { PostgresInventoryReservationRepository } from './persistence/postgres-inventory-reservation.repository';
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
  {
    provide: FifoReservationAllocationStore,
    useClass: PostgresFifoReservationAllocationRepository,
  },
  {
    provide: InventoryReservationStore,
    useClass: PostgresInventoryReservationRepository,
  },
] as const;
