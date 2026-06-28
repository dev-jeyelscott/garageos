import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  DatabaseTransactionRunner,
  DatabaseTransactionWork,
} from '../../../shared/database/database-transaction';
import { FifoLayerService } from './fifo-layer.service';
import {
  FifoLayerStore,
  type CreateFifoLayerInput,
  type FifoLayerAllocationCandidateRecord,
  type FifoLayerRecord,
  type LockOpenFifoLayersForAllocationInput,
} from './fifo-layer.store';
import {
  FifoReservationAllocationStore,
  type CreateFifoReservationAllocationInput,
  type FifoReservationAllocationRecord,
  type ReleaseFifoReservationAllocationsInput,
} from './fifo-reservation-allocation.store';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  INVENTORY_TRANSACTION_TYPES,
  InventoryLedgerStore,
  type CreateInventoryLedgerEntryInput,
  type InventoryLedgerEntryRecord,
} from './inventory-ledger.store';
import { InventoryReservationService } from './inventory-reservation.service';
import {
  InventoryReservationStore,
  type CreateInventoryReservationInput,
  type InventoryReservationRecord,
  type LockInventoryReservationInput,
  type ReleaseInventoryReservationInput,
} from './inventory-reservation.store';
import { InventoryStockBalancesService } from './inventory-stock-balances.service';
import {
  StockBalanceStore,
  type DecrementReservedQuantityInput,
  type GetStockAvailabilityInput,
  type IncrementReservedQuantityInput,
  type ListStockBalancesInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from './stock-balance.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_ID = '66666666-6666-4666-8666-666666666666';
const RESERVATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RELEASED_AT = new Date('2026-06-28T13:00:00.000Z');
const FIFO_LAYER_ID_1 = '77777777-7777-4777-8777-777777777777';
const FIFO_LAYER_ID_2 = '88888888-8888-4888-8888-888888888888';
const FIFO_SOURCE_ID = '99999999-9999-4999-8999-999999999999';
const RESERVED_AT = new Date('2026-06-28T12:00:00.000Z');

describe('InventoryReservationService', () => {
  it('creates an active reservation, allocates oldest FIFO layers, increments reserved stock, and writes a ledger entry', async () => {
    const {
      service,
      transactionRunner,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    stockStore.stockAvailability = createStockAvailabilityRecord();
    stockStore.incrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '5.000',
      availableQty: '5.000',
      lockVersion: 1,
    });
    fifoLayerStore.allocationCandidates = [
      createFifoLayerAllocationCandidateRecord({
        id: FIFO_LAYER_ID_1,
        remainingQuantity: '1.500',
        unitCost: '100.00',
        activeReservedQuantity: '0.000',
        allocatableQuantity: '1.500',
        receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
      createFifoLayerAllocationCandidateRecord({
        id: FIFO_LAYER_ID_2,
        remainingQuantity: '5.000',
        unitCost: '110.00',
        activeReservedQuantity: '1.000',
        allocatableQuantity: '4.000',
        receivedAt: new Date('2026-06-02T00:00:00.000Z'),
      }),
    ];

    const result = await service.reserveInventory({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      sourceType: ' Job_Order_Line ',
      sourceId: SOURCE_ID,
      requestedQuantity: '2',
      transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
      reservedAt: RESERVED_AT,
      createdByUserId: USER_ID,
    });

    const reservationId = reservationStore.createReservationInputs[0]?.id;

    expect(transactionRunner.runCount).toBe(1);
    expect(stockStore.lockAvailabilityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(fifoLayerStore.lockOpenLayersForAllocationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(reservationStore.createReservationInputs).toHaveLength(1);
    expect(reservationStore.createReservationInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      sourceType: 'job_order_line',
      sourceId: SOURCE_ID,
      requestedQuantity: '2.000',
      reservedQuantity: '2.000',
      status: 'active',
      reservedAt: RESERVED_AT,
      releasedAt: null,
      consumedAt: null,
    });
    expect(fifoReservationAllocationStore.createAllocationInputs).toMatchObject([
      {
        tenantId: TENANT_ID,
        reservationId,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
        unitCostSnapshot: '100.00',
        status: 'active',
        allocatedAt: RESERVED_AT,
        releasedAt: null,
        consumedAt: null,
      },
      {
        tenantId: TENANT_ID,
        reservationId,
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '0.500',
        unitCostSnapshot: '110.00',
        status: 'active',
        allocatedAt: RESERVED_AT,
        releasedAt: null,
        consumedAt: null,
      },
    ]);
    expect(stockStore.incrementReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        reservedQuantityDelta: '2.000',
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);
    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '2.000',
      unitCost: null,
      totalCost: null,
      sourceType: 'job_order_line',
      sourceId: SOURCE_ID,
      occurredAt: RESERVED_AT,
      createdByUserId: USER_ID,
    });
    expect(result.reservation).toMatchObject({
      sourceType: 'job_order_line',
      requestedQuantity: '2.000',
      reservedQuantity: '2.000',
      status: 'active',
    });
    expect(result.fifoAllocations).toMatchObject([
      {
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
        unitCostSnapshot: '100.00',
        status: 'active',
      },
      {
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '0.500',
        unitCostSnapshot: '110.00',
        status: 'active',
      },
    ]);
    expect(result.stockAvailability).toMatchObject({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      on_hand_qty: '10.000',
      reserved_qty: '5.000',
      available_qty: '5.000',
      lock_version: 1,
    });
  });

  it('blocks reservation when available stock is insufficient before FIFO allocation', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    stockStore.stockAvailability = createStockAvailabilityRecord({
      onHandQty: '10.000',
      reservedQty: '9.000',
      availableQty: '1.000',
    });

    await expect(
      service.reserveInventory({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        requestedQuantity: '1.001',
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: RESERVED_AT,
        createdByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
    });

    expect(fifoLayerStore.lockOpenLayersForAllocationInputs).toEqual([]);
    expect(reservationStore.createReservationInputs).toEqual([]);
    expect(fifoReservationAllocationStore.createAllocationInputs).toEqual([]);
    expect(stockStore.incrementReservedQuantityInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('blocks reservation when FIFO allocatable quantity is insufficient', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    stockStore.stockAvailability = createStockAvailabilityRecord();
    fifoLayerStore.allocationCandidates = [
      createFifoLayerAllocationCandidateRecord({
        id: FIFO_LAYER_ID_1,
        remainingQuantity: '2.000',
        activeReservedQuantity: '1.000',
        allocatableQuantity: '1.000',
      }),
    ];

    await expect(
      service.reserveInventory({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        requestedQuantity: '2',
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: RESERVED_AT,
        createdByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FIFO_ALLOCATION_CONFLICT,
      details: [
        {
          field: 'requested_qty',
          code: 'insufficient_fifo_allocatable_quantity',
        },
      ],
    });

    expect(fifoLayerStore.lockOpenLayersForAllocationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(reservationStore.createReservationInputs).toEqual([]);
    expect(fifoReservationAllocationStore.createAllocationInputs).toEqual([]);
    expect(stockStore.incrementReservedQuantityInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('supports inventory transfer reservation transaction type with FIFO allocation', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    stockStore.stockAvailability = createStockAvailabilityRecord();
    stockStore.incrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '4.000',
      availableQty: '6.000',
      lockVersion: 1,
    });

    await service.reserveInventory({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      sourceType: 'inventory_transfer_line',
      sourceId: SOURCE_ID,
      requestedQuantity: '1',
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION,
      reservedAt: RESERVED_AT,
      createdByUserId: USER_ID,
    });

    const reservationId = reservationStore.createReservationInputs[0]?.id;

    expect(reservationStore.createReservationInputs[0]).toMatchObject({
      sourceType: 'inventory_transfer_line',
      requestedQuantity: '1.000',
      reservedQuantity: '1.000',
      status: 'active',
    });
    expect(fifoReservationAllocationStore.createAllocationInputs).toMatchObject([
      {
        tenantId: TENANT_ID,
        reservationId,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.000',
        unitCostSnapshot: '100.00',
        status: 'active',
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION,
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '1.000',
      sourceType: 'inventory_transfer_line',
      sourceId: SOURCE_ID,
    });
  });

  it('rejects unsupported reservation transaction types before opening a transaction', async () => {
    const { service, transactionRunner } = createService();

    await expect(
      service.reserveInventory({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        requestedQuantity: '1',
        transactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
        reservedAt: RESERVED_AT,
        createdByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'transaction_type',
          code: 'unsupported_inventory_reservation_transaction_type',
        },
      ],
    });

    expect(transactionRunner.runCount).toBe(0);
  });

  it('releases an active reservation, releases FIFO allocations, decrements reserved stock, and writes a release ledger entry', async () => {
    const {
      service,
      transactionRunner,
      stockStore,
      reservationStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '1.000',
      availableQty: '9.000',
      lockVersion: 2,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
      }),
      createFifoReservationAllocationRecord({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '0.500',
      }),
    ];

    const result = await service.releaseInventory({
      tenantId: TENANT_ID,
      reservationId: RESERVATION_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
      releasedAt: RELEASED_AT,
      releasedByUserId: USER_ID,
    });

    expect(transactionRunner.runCount).toBe(1);
    expect(reservationStore.lockActiveReservationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(stockStore.decrementReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        reservedQuantityDelta: '2.000',
      },
    ]);
    expect(fifoReservationAllocationStore.releaseActiveAllocationsByReservationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releasedAt: RELEASED_AT,
      },
    ]);
    expect(reservationStore.markReservationReleasedInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releasedAt: RELEASED_AT,
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);
    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '-2.000',
      unitCost: null,
      totalCost: null,
      sourceType: 'job_order_line',
      sourceId: SOURCE_ID,
      occurredAt: RELEASED_AT,
      createdByUserId: USER_ID,
    });
    expect(result.reservation).toMatchObject({
      id: RESERVATION_ID,
      reservedQuantity: '0.000',
      status: 'released',
      releasedAt: RELEASED_AT,
    });
    expect(result.fifoAllocations).toMatchObject([
      {
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
        status: 'released',
        releasedAt: RELEASED_AT,
      },
      {
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '0.500',
        status: 'released',
        releasedAt: RELEASED_AT,
      },
    ]);
    expect(result.stockAvailability).toMatchObject({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      on_hand_qty: '10.000',
      reserved_qty: '1.000',
      available_qty: '9.000',
      lock_version: 2,
    });
  });

  it('supports inventory transfer reservation release transaction type', async () => {
    const { service, stockStore, reservationStore, ledgerStore } = createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      sourceType: 'inventory_transfer_line',
      reservedQuantity: '1.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '2.000',
      availableQty: '8.000',
      lockVersion: 2,
    });

    await service.releaseInventory({
      tenantId: TENANT_ID,
      reservationId: RESERVATION_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
      releasedAt: RELEASED_AT,
      releasedByUserId: USER_ID,
    });

    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '-1.000',
      sourceType: 'inventory_transfer_line',
      sourceId: SOURCE_ID,
    });
  });

  it('blocks release when reservation is missing or not active', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [
        {
          field: 'reservation_id',
          code: 'reservation_not_active',
        },
      ],
    });

    expect(reservationStore.lockActiveReservationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(stockStore.decrementReservedQuantityInputs).toEqual([]);
    expect(fifoReservationAllocationStore.releaseActiveAllocationsByReservationInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('blocks release when reserved stock cannot be decremented', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [
        {
          field: 'reservation_id',
          code: 'reservation_release_conflict',
        },
      ],
    });

    expect(stockStore.decrementReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        reservedQuantityDelta: '2.000',
      },
    ]);
    expect(reservationStore.markReservationReleasedInputs).toEqual([]);
    expect(fifoReservationAllocationStore.releaseActiveAllocationsByReservationInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('rejects unsupported reservation release transaction types before opening a transaction', async () => {
    const { service, transactionRunner } = createService();

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'transaction_type',
          code: 'unsupported_inventory_reservation_release_transaction_type',
        },
      ],
    });

    expect(transactionRunner.runCount).toBe(0);
  });

  it('requires requested quantity to be greater than zero', async () => {
    const { service, transactionRunner } = createService();

    await expect(
      service.reserveInventory({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        requestedQuantity: '0',
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: RESERVED_AT,
        createdByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'requested_qty',
          code: 'quantity_must_be_positive',
        },
      ],
    });

    expect(transactionRunner.runCount).toBe(0);
  });
});

function createService(): {
  readonly service: InventoryReservationService;
  readonly transactionRunner: FakeTransactionRunner;
  readonly stockStore: FakeStockBalanceStore;
  readonly fifoLayerStore: FakeFifoLayerStore;
  readonly reservationStore: FakeInventoryReservationStore;
  readonly fifoReservationAllocationStore: FakeFifoReservationAllocationStore;
  readonly ledgerStore: FakeInventoryLedgerStore;
} {
  const transactionRunner = new FakeTransactionRunner();
  const stockStore = new FakeStockBalanceStore();
  const fifoLayerStore = new FakeFifoLayerStore();
  const reservationStore = new FakeInventoryReservationStore();
  const fifoReservationAllocationStore = new FakeFifoReservationAllocationStore();
  const ledgerStore = new FakeInventoryLedgerStore();
  const stockBalancesService = new InventoryStockBalancesService(stockStore);
  const fifoLayerService = new FifoLayerService(fifoLayerStore);
  const ledgerService = new InventoryLedgerService(ledgerStore);

  return {
    service: new InventoryReservationService(
      reservationStore,
      stockBalancesService,
      fifoLayerService,
      fifoReservationAllocationStore,
      stockStore,
      ledgerService,
      transactionRunner,
    ),
    transactionRunner,
    stockStore,
    fifoLayerStore,
    reservationStore,
    fifoReservationAllocationStore,
    ledgerStore,
  };
}

function createStockAvailabilityRecord(
  overrides: Partial<StockAvailabilityRecord> = {},
): StockAvailabilityRecord {
  return {
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    lockVersion: 0,
    ...overrides,
  };
}

function createFifoLayerAllocationCandidateRecord(
  overrides: Partial<FifoLayerAllocationCandidateRecord> = {},
): FifoLayerAllocationCandidateRecord {
  return {
    id: FIFO_LAYER_ID_1,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    quantityReceived: '10.000',
    remainingQuantity: '10.000',
    unitCost: '100.00',
    sourceTransactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
    sourceTransactionId: FIFO_SOURCE_ID,
    receivedAt: new Date('2026-06-01T00:00:00.000Z'),
    originalSourceLayerId: null,
    activeReservedQuantity: '0.000',
    allocatableQuantity: '10.000',
    ...overrides,
  };
}

function createInventoryReservationRecord(
  overrides: Partial<InventoryReservationRecord> = {},
): InventoryReservationRecord {
  return {
    id: RESERVATION_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    sourceType: 'job_order_line',
    sourceId: SOURCE_ID,
    requestedQuantity: '2.000',
    reservedQuantity: '2.000',
    status: 'active',
    reservedAt: RESERVED_AT,
    releasedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

function createFifoReservationAllocationRecord(
  overrides: Partial<FifoReservationAllocationRecord> = {},
): FifoReservationAllocationRecord {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenantId: TENANT_ID,
    reservationId: RESERVATION_ID,
    fifoLayerId: FIFO_LAYER_ID_1,
    reservedQuantity: '2.000',
    unitCostSnapshot: '100.00',
    status: 'active',
    allocatedAt: RESERVED_AT,
    releasedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

class FakeTransactionRunner implements DatabaseTransactionRunner {
  runCount = 0;
  readonly transactionClient = {} as DatabaseQueryClient;

  async runInTransaction<Result>(work: DatabaseTransactionWork<Result>): Promise<Result> {
    this.runCount += 1;

    return work(this.transactionClient);
  }
}

class FakeStockBalanceStore extends StockBalanceStore {
  stockAvailability: StockAvailabilityRecord | null = null;
  incrementedStockAvailability: StockAvailabilityRecord | null = null;
  decrementedStockAvailability: StockAvailabilityRecord | null = null;

  readonly lockAvailabilityInputs: GetStockAvailabilityInput[] = [];
  readonly incrementReservedQuantityInputs: IncrementReservedQuantityInput[] = [];
  readonly decrementReservedQuantityInputs: DecrementReservedQuantityInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async listStockBalances(): Promise<readonly StockBalanceRecord[]> {
    return [];
  }

  async getStockAvailability(): Promise<StockAvailabilityRecord | null> {
    return this.stockAvailability;
  }

  async lockStockAvailabilityForUpdate(
    input: GetStockAvailabilityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.lockAvailabilityInputs.push(input);

    return this.stockAvailability;
  }

  async incrementReservedQuantity(
    input: IncrementReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.incrementReservedQuantityInputs.push(input);

    return this.incrementedStockAvailability;
  }

  async decrementReservedQuantity(
    input: DecrementReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.decrementReservedQuantityInputs.push(input);

    return this.decrementedStockAvailability;
  }
}

class FakeFifoLayerStore extends FifoLayerStore {
  allocationCandidates: readonly FifoLayerAllocationCandidateRecord[] = [
    createFifoLayerAllocationCandidateRecord(),
  ];

  readonly lockOpenLayersForAllocationInputs: LockOpenFifoLayersForAllocationInput[] = [];

  async createLayer(input: CreateFifoLayerInput): Promise<FifoLayerRecord> {
    return input;
  }

  async lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    this.lockOpenLayersForAllocationInputs.push(input);

    return this.allocationCandidates;
  }
}

class FakeInventoryReservationStore extends InventoryReservationStore {
  activeReservation: InventoryReservationRecord | null = null;

  readonly createReservationInputs: CreateInventoryReservationInput[] = [];
  readonly lockActiveReservationInputs: LockInventoryReservationInput[] = [];
  readonly markReservationReleasedInputs: ReleaseInventoryReservationInput[] = [];

  async createReservation(
    input: CreateInventoryReservationInput,
  ): Promise<InventoryReservationRecord> {
    this.createReservationInputs.push(input);

    return input;
  }

  async lockActiveReservationForUpdate(
    input: LockInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    this.lockActiveReservationInputs.push(input);

    return this.activeReservation;
  }

  async markReservationReleased(
    input: ReleaseInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    this.markReservationReleasedInputs.push(input);

    if (this.activeReservation === null) {
      return null;
    }

    const releasedReservation: InventoryReservationRecord = {
      ...this.activeReservation,
      reservedQuantity: '0.000',
      status: 'released',
      releasedAt: input.releasedAt,
    };

    this.activeReservation = releasedReservation;

    return releasedReservation;
  }
}

class FakeFifoReservationAllocationStore extends FifoReservationAllocationStore {
  activeAllocations: readonly FifoReservationAllocationRecord[] = [
    createFifoReservationAllocationRecord(),
  ];

  readonly createAllocationInputs: CreateFifoReservationAllocationInput[] = [];
  readonly releaseActiveAllocationsByReservationInputs: ReleaseFifoReservationAllocationsInput[] =
    [];

  async createAllocations(
    inputs: readonly CreateFifoReservationAllocationInput[],
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    this.createAllocationInputs.push(...inputs);

    return inputs;
  }

  async releaseActiveAllocationsByReservation(
    input: ReleaseFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    this.releaseActiveAllocationsByReservationInputs.push(input);

    return this.activeAllocations.map((allocation) => ({
      ...allocation,
      status: 'released',
      releasedAt: input.releasedAt,
    }));
  }
}

class FakeInventoryLedgerStore extends InventoryLedgerStore {
  readonly createLedgerEntryInputs: CreateInventoryLedgerEntryInput[] = [];

  async createLedgerEntry(
    input: CreateInventoryLedgerEntryInput,
  ): Promise<InventoryLedgerEntryRecord> {
    this.createLedgerEntryInputs.push(input);

    return input;
  }
}
