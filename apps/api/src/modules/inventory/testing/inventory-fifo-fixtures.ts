import {
  FIFO_LAYER_SOURCE_TRANSACTION_TYPES,
  type FifoLayerAllocationCandidateRecord,
} from '../application/fifo-layer.store';
import {
  FIFO_ALLOCATION_STATUSES,
  type FifoReservationAllocationRecord,
} from '../application/fifo-reservation-allocation.store';
import {
  INVENTORY_TRANSACTION_TYPES,
  type InventoryTransactionType,
} from '../application/inventory-ledger.store';
import {
  INVENTORY_RESERVATION_STATUSES,
  type InventoryReservationRecord,
} from '../application/inventory-reservation.store';
import type {
  InventoryReadBranchRecord,
  InventoryReadFifoLayerRecord,
  InventoryReadLedgerEntryRecord,
  InventoryReadProductCategoryRecord,
  InventoryReadProductRecord,
  InventoryReadStockBalanceRecord,
} from '../application/inventory-read.store';
import type {
  StockAvailabilityRecord,
  StockBalanceRecord,
} from '../application/stock-balance.store';

export const FIFO_FIXTURE_IDS = {
  TENANT: '11111111-1111-4111-8111-111111111111',
  BRANCH_MAIN: '22222222-2222-4222-8222-222222222222',
  BRANCH_SECONDARY: '99999999-9999-4999-8999-999999999999',
  USER: '33333333-3333-4333-8333-333333333333',
  CATEGORY_ENGINE_OIL: '44444444-4444-4444-8444-444444444444',
  PRODUCT_ENGINE_OIL: '55555555-5555-4555-8555-555555555555',
  JOB_ORDER_PART_LINE_SOURCE: '66666666-6666-4666-8666-666666666666',
  RESERVATION: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  FIFO_LAYER_OLDEST: '77777777-7777-4777-8777-777777777771',
  FIFO_LAYER_MIDDLE: '77777777-7777-4777-8777-777777777772',
  FIFO_LAYER_NEWEST: '77777777-7777-4777-8777-777777777773',
  FIFO_ALLOCATION_OLDEST: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  FIFO_ALLOCATION_MIDDLE: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  FIFO_CONSUMPTION_OLDEST: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  FIFO_CONSUMPTION_MIDDLE: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  PURCHASE_RECEIVE_OLDEST: '99999999-9999-4999-8999-999999999991',
  PURCHASE_RECEIVE_MIDDLE: '99999999-9999-4999-8999-999999999992',
  PURCHASE_RECEIVE_NEWEST: '99999999-9999-4999-8999-999999999993',
  LEDGER_RESERVATION: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
  LEDGER_CONSUMPTION: 'dddddddd-dddd-4ddd-8ddd-dddddddddd02',
} as const;

export const FIFO_FIXTURE_DATES = {
  RECEIVED_OLDEST: new Date('2026-06-01T08:00:00.000Z'),
  RECEIVED_MIDDLE: new Date('2026-06-05T08:00:00.000Z'),
  RECEIVED_NEWEST: new Date('2026-06-10T08:00:00.000Z'),
  RESERVED_AT: new Date('2026-06-28T12:00:00.000Z'),
  RELEASED_AT: new Date('2026-06-28T13:00:00.000Z'),
  CONSUMED_AT: new Date('2026-06-28T14:00:00.000Z'),
  UPDATED_AT: new Date('2026-06-28T15:00:00.000Z'),
} as const;

export const FIFO_FIXTURE_EXPECTED = {
  REQUESTED_RESERVATION_QTY: '2.000',
  OLDEST_ALLOCATION_QTY: '1.500',
  MIDDLE_ALLOCATION_QTY: '0.500',
  OLDEST_UNIT_COST: '100.00',
  MIDDLE_UNIT_COST: '110.00',
  NEWEST_UNIT_COST: '120.00',
  OLDEST_CONSUMPTION_TOTAL_COST: '150.00',
  MIDDLE_CONSUMPTION_TOTAL_COST: '55.00',
  TOTAL_CONSUMPTION_COST: '205.00',
} as const;

export function createDeterministicStockAvailabilityRecord(
  overrides: Partial<StockAvailabilityRecord> = {},
): StockAvailabilityRecord {
  return {
    tenantId: FIFO_FIXTURE_IDS.TENANT,
    branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
    productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    lockVersion: 0,
    ...overrides,
  };
}

export function createDeterministicStockBalanceRecord(
  overrides: Partial<StockBalanceRecord> = {},
): StockBalanceRecord {
  return {
    tenantId: FIFO_FIXTURE_IDS.TENANT,
    branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
    branchName: 'Main Branch',
    branchStatus: 'active',
    productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
    productName: 'Engine Oil 10W-40 1L',
    sku: 'OIL-10W40-1L',
    barcode: '4800000000012',
    brand: 'Motul',
    unitOfMeasure: 'piece',
    productStatus: 'active',
    categoryId: FIFO_FIXTURE_IDS.CATEGORY_ENGINE_OIL,
    categoryName: 'Engine Oil',
    categoryStatus: 'active',
    reorderLevel: '5.000',
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    isLowStock: false,
    updatedAt: FIFO_FIXTURE_DATES.UPDATED_AT,
    lockVersion: 0,
    ...overrides,
  };
}

export function createDeterministicFifoLayerAllocationCandidateRecord(
  overrides: Partial<FifoLayerAllocationCandidateRecord> = {},
): FifoLayerAllocationCandidateRecord {
  return {
    id: FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
    tenantId: FIFO_FIXTURE_IDS.TENANT,
    branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
    productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
    quantityReceived: '1.500',
    remainingQuantity: '1.500',
    unitCost: FIFO_FIXTURE_EXPECTED.OLDEST_UNIT_COST,
    sourceTransactionType: FIFO_LAYER_SOURCE_TRANSACTION_TYPES.PURCHASE_RECEIVE,
    sourceTransactionId: FIFO_FIXTURE_IDS.PURCHASE_RECEIVE_OLDEST,
    receivedAt: FIFO_FIXTURE_DATES.RECEIVED_OLDEST,
    originalSourceLayerId: null,
    activeReservedQuantity: '0.000',
    allocatableQuantity: '1.500',
    ...overrides,
  };
}

export function createDeterministicFifoLayerAllocationCandidates(): readonly FifoLayerAllocationCandidateRecord[] {
  return [
    createDeterministicFifoLayerAllocationCandidateRecord(),
    createDeterministicFifoLayerAllocationCandidateRecord({
      id: FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
      quantityReceived: '5.000',
      remainingQuantity: '5.000',
      unitCost: FIFO_FIXTURE_EXPECTED.MIDDLE_UNIT_COST,
      sourceTransactionId: FIFO_FIXTURE_IDS.PURCHASE_RECEIVE_MIDDLE,
      receivedAt: FIFO_FIXTURE_DATES.RECEIVED_MIDDLE,
      activeReservedQuantity: '1.000',
      allocatableQuantity: '4.000',
    }),
    createDeterministicFifoLayerAllocationCandidateRecord({
      id: FIFO_FIXTURE_IDS.FIFO_LAYER_NEWEST,
      quantityReceived: '3.000',
      remainingQuantity: '3.000',
      unitCost: FIFO_FIXTURE_EXPECTED.NEWEST_UNIT_COST,
      sourceTransactionId: FIFO_FIXTURE_IDS.PURCHASE_RECEIVE_NEWEST,
      receivedAt: FIFO_FIXTURE_DATES.RECEIVED_NEWEST,
      activeReservedQuantity: '0.000',
      allocatableQuantity: '3.000',
    }),
  ];
}

export function createDeterministicInventoryReservationRecord(
  overrides: Partial<InventoryReservationRecord> = {},
): InventoryReservationRecord {
  return {
    id: FIFO_FIXTURE_IDS.RESERVATION,
    tenantId: FIFO_FIXTURE_IDS.TENANT,
    branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
    productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
    sourceType: 'job_order_line',
    sourceId: FIFO_FIXTURE_IDS.JOB_ORDER_PART_LINE_SOURCE,
    requestedQuantity: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
    reservedQuantity: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
    status: INVENTORY_RESERVATION_STATUSES.ACTIVE,
    reservedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
    releasedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

export function createDeterministicFifoReservationAllocationRecord(
  overrides: Partial<FifoReservationAllocationRecord> = {},
): FifoReservationAllocationRecord {
  return {
    id: FIFO_FIXTURE_IDS.FIFO_ALLOCATION_OLDEST,
    tenantId: FIFO_FIXTURE_IDS.TENANT,
    reservationId: FIFO_FIXTURE_IDS.RESERVATION,
    fifoLayerId: FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
    reservedQuantity: FIFO_FIXTURE_EXPECTED.OLDEST_ALLOCATION_QTY,
    unitCostSnapshot: FIFO_FIXTURE_EXPECTED.OLDEST_UNIT_COST,
    status: FIFO_ALLOCATION_STATUSES.ACTIVE,
    allocatedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
    releasedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

export function createDeterministicActiveFifoReservationAllocations(): readonly FifoReservationAllocationRecord[] {
  return [
    createDeterministicFifoReservationAllocationRecord(),
    createDeterministicFifoReservationAllocationRecord({
      id: FIFO_FIXTURE_IDS.FIFO_ALLOCATION_MIDDLE,
      fifoLayerId: FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
      reservedQuantity: FIFO_FIXTURE_EXPECTED.MIDDLE_ALLOCATION_QTY,
      unitCostSnapshot: FIFO_FIXTURE_EXPECTED.MIDDLE_UNIT_COST,
    }),
  ];
}

export function createDeterministicInventoryReadBranchRecord(
  overrides: Partial<InventoryReadBranchRecord> = {},
): InventoryReadBranchRecord {
  return {
    id: FIFO_FIXTURE_IDS.BRANCH_MAIN,
    name: 'Main Branch',
    status: 'active',
    ...overrides,
  };
}

export function createDeterministicInventoryReadProductCategoryRecord(
  overrides: Partial<InventoryReadProductCategoryRecord> = {},
): InventoryReadProductCategoryRecord {
  return {
    id: FIFO_FIXTURE_IDS.CATEGORY_ENGINE_OIL,
    name: 'Engine Oil',
    status: 'active',
    ...overrides,
  };
}

export function createDeterministicInventoryReadProductRecord(
  overrides: Partial<InventoryReadProductRecord> = {},
): InventoryReadProductRecord {
  return {
    id: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
    name: 'Engine Oil 10W-40 1L',
    sku: 'OIL-10W40-1L',
    barcode: '4800000000012',
    brand: 'Motul',
    unitOfMeasure: 'piece',
    status: 'active',
    category: createDeterministicInventoryReadProductCategoryRecord(),
    reorderLevel: '5.000',
    ...overrides,
  };
}

export function createDeterministicInventoryReadStockBalanceRecord(
  overrides: Partial<InventoryReadStockBalanceRecord> = {},
): InventoryReadStockBalanceRecord {
  return {
    branch: createDeterministicInventoryReadBranchRecord(),
    product: createDeterministicInventoryReadProductRecord(),
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    isLowStock: false,
    updatedAt: FIFO_FIXTURE_DATES.UPDATED_AT,
    lockVersion: 0,
    ...overrides,
  };
}

export function createDeterministicInventoryReadFifoLayerRecord(
  overrides: Partial<InventoryReadFifoLayerRecord> = {},
): InventoryReadFifoLayerRecord {
  return {
    id: FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
    branch: createDeterministicInventoryReadBranchRecord(),
    product: createDeterministicInventoryReadProductRecord(),
    quantityReceived: '1.500',
    remainingQuantity: '1.500',
    activeReservedQuantity: '0.000',
    allocatableQuantity: '1.500',
    unitCost: FIFO_FIXTURE_EXPECTED.OLDEST_UNIT_COST,
    sourceTransactionType: FIFO_LAYER_SOURCE_TRANSACTION_TYPES.PURCHASE_RECEIVE,
    sourceTransactionId: FIFO_FIXTURE_IDS.PURCHASE_RECEIVE_OLDEST,
    receivedAt: FIFO_FIXTURE_DATES.RECEIVED_OLDEST,
    originalSourceLayerId: null,
    ...overrides,
  };
}

export function createDeterministicInventoryReadFifoLayerRecords(): readonly InventoryReadFifoLayerRecord[] {
  return createDeterministicFifoLayerAllocationCandidates().map((layer) =>
    createDeterministicInventoryReadFifoLayerRecord({
      id: layer.id,
      quantityReceived: layer.quantityReceived,
      remainingQuantity: layer.remainingQuantity,
      activeReservedQuantity: layer.activeReservedQuantity,
      allocatableQuantity: layer.allocatableQuantity,
      unitCost: layer.unitCost,
      sourceTransactionType: layer.sourceTransactionType,
      sourceTransactionId: layer.sourceTransactionId,
      receivedAt: layer.receivedAt,
      originalSourceLayerId: layer.originalSourceLayerId,
    }),
  );
}

export function createDeterministicInventoryReadLedgerEntryRecord(
  overrides: Partial<InventoryReadLedgerEntryRecord> = {},
): InventoryReadLedgerEntryRecord {
  return {
    id: FIFO_FIXTURE_IDS.LEDGER_CONSUMPTION,
    branch: createDeterministicInventoryReadBranchRecord(),
    product: createDeterministicInventoryReadProductRecord(),
    transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
    quantityDeltaOnHand: `-${FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY}`,
    quantityDeltaReserved: `-${FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY}`,
    unitCost: null,
    totalCost: FIFO_FIXTURE_EXPECTED.TOTAL_CONSUMPTION_COST,
    sourceType: 'job_order_line',
    sourceId: FIFO_FIXTURE_IDS.JOB_ORDER_PART_LINE_SOURCE,
    occurredAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
    createdByUserId: FIFO_FIXTURE_IDS.USER,
    ...overrides,
  };
}

export function createDeterministicReservationLedgerEntryRecord(
  overrides: Partial<InventoryReadLedgerEntryRecord> = {},
): InventoryReadLedgerEntryRecord {
  return createDeterministicInventoryReadLedgerEntryRecord({
    id: FIFO_FIXTURE_IDS.LEDGER_RESERVATION,
    transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
    quantityDeltaOnHand: '0.000',
    quantityDeltaReserved: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
    unitCost: null,
    totalCost: null,
    occurredAt: FIFO_FIXTURE_DATES.RESERVED_AT,
    ...overrides,
  });
}

export function createDeterministicInventoryTransactionTypes(): {
  readonly reservation: InventoryTransactionType;
  readonly consumption: InventoryTransactionType;
} {
  return {
    reservation: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
    consumption: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
  };
}
