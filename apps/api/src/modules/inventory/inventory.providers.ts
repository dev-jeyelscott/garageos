import { FifoConsumptionStore } from './application/fifo-consumption.store';
import { FifoLayerStore } from './application/fifo-layer.store';
import { FifoReservationAllocationStore } from './application/fifo-reservation-allocation.store';
import { InventoryLedgerStore } from './application/inventory-ledger.store';
import { InventoryReadStore } from './application/inventory-read.store';
import { InventoryReconciliationStore } from './application/inventory-reconciliation.store';
import { InventoryReservationStore } from './application/inventory-reservation.store';
import { LowStockAlertStore } from './application/low-stock-alert.store';
import { StockBalanceStore } from './application/stock-balance.store';
import { PostgresFifoConsumptionRepository } from './persistence/postgres-fifo-consumption.repository';
import { PostgresFifoLayerRepository } from './persistence/postgres-fifo-layer.repository';
import { PostgresFifoReservationAllocationRepository } from './persistence/postgres-fifo-reservation-allocation.repository';
import { PostgresInventoryLedgerRepository } from './persistence/postgres-inventory-ledger.repository';
import { PostgresInventoryReadRepository } from './persistence/postgres-inventory-read.repository';
import { PostgresInventoryReconciliationRepository } from './persistence/postgres-inventory-reconciliation.repository';
import { PostgresInventoryReservationRepository } from './persistence/postgres-inventory-reservation.repository';
import { PostgresLowStockAlertRepository } from './persistence/postgres-low-stock-alert.repository';
import { PostgresStockBalanceRepository } from './persistence/postgres-stock-balance.repository';

export const INVENTORY_PROVIDERS = [
  {
    provide: StockBalanceStore,
    useClass: PostgresStockBalanceRepository,
  },
  {
    provide: LowStockAlertStore,
    useClass: PostgresLowStockAlertRepository,
  },
  {
    provide: InventoryLedgerStore,
    useClass: PostgresInventoryLedgerRepository,
  },
  {
    provide: InventoryReadStore,
    useClass: PostgresInventoryReadRepository,
  },
  {
    provide: InventoryReconciliationStore,
    useClass: PostgresInventoryReconciliationRepository,
  },
  {
    provide: FifoLayerStore,
    useClass: PostgresFifoLayerRepository,
  },
  {
    provide: FifoConsumptionStore,
    useClass: PostgresFifoConsumptionRepository,
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
