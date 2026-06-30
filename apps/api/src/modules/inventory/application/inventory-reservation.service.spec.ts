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
  type DecrementFifoLayerRemainingQuantityInput,
  type FifoLayerAllocationCandidateRecord,
  type FifoLayerRecord,
  type LockOpenFifoLayersForAllocationInput,
} from './fifo-layer.store';
import {
  FifoReservationAllocationStore,
  type CreateFifoReservationAllocationInput,
  type FifoReservationAllocationRecord,
  type ConsumeFifoReservationAllocationsInput,
  type LockFifoReservationAllocationsInput,
  type ReleaseFifoReservationAllocationsInput,
  type ReleaseFifoReservationAllocationInput,
  type UpdateFifoReservationAllocationQuantityInput,
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
  type ConsumeInventoryReservationInput,
  type ReleaseInventoryReservationInput,
  type PartiallyReleaseInventoryReservationInput,
} from './inventory-reservation.store';
import { InventoryStockBalancesService } from './inventory-stock-balances.service';
import {
  StockBalanceStore,
  type DecrementReservedQuantityInput,
  type GetStockAvailabilityInput,
  type IncrementReservedQuantityInput,
  type DecrementOnHandAndReservedQuantityInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from './stock-balance.store';
import {
  FifoConsumptionStore,
  type CreateFifoConsumptionInput,
  type FifoConsumptionRecord,
} from './fifo-consumption.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_ID = '66666666-6666-4666-8666-666666666666';
const RESERVATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_BRANCH_ID = '22222222-2222-4222-8222-222222222223';
const OTHER_PRODUCT_ID = '55555555-5555-4555-8555-555555555556';
const OTHER_SOURCE_ID = '66666666-6666-4666-8666-666666666667';
const RELEASED_AT = new Date('2026-06-28T13:00:00.000Z');
const CONSUMED_AT = new Date('2026-06-28T14:00:00.000Z');
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

  it('partially releases a single FIFO allocation and keeps the allocation active', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      sourceType: 'inventory_transfer_line',
      reservedQuantity: '2.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '1.500',
      availableQty: '8.500',
      lockVersion: 2,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '2.000',
      }),
    ];

    const result = await service.releaseInventory({
      tenantId: TENANT_ID,
      reservationId: RESERVATION_ID,
      releaseQuantity: '0.500',
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
      releasedAt: RELEASED_AT,
      releasedByUserId: USER_ID,
    });

    expect(reservationStore.decrementActiveReservationQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releaseQuantity: '0.500',
      },
    ]);
    expect(fifoReservationAllocationStore.updateActiveAllocationQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        allocationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '1.500',
      },
    ]);
    expect(fifoReservationAllocationStore.releaseActiveAllocationInputs).toEqual([]);
    expect(stockStore.decrementReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        reservedQuantityDelta: '0.500',
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
      quantityDeltaReserved: '-0.500',
    });
    expect(result.reservation).toMatchObject({
      id: RESERVATION_ID,
      reservedQuantity: '1.500',
      status: 'active',
      releasedAt: null,
    });
    expect(result.fifoAllocations).toMatchObject([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '0.500',
        status: 'released',
        releasedAt: RELEASED_AT,
      },
    ]);
    expect(fifoReservationAllocationStore.activeAllocations).toMatchObject([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '1.500',
        status: 'active',
        releasedAt: null,
      },
    ]);
  });

  it('partially releases across newest FIFO allocations first', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '4.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '1.500',
      availableQty: '8.500',
      lockVersion: 2,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
      }),
      createFifoReservationAllocationRecord({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '1.000',
      }),
      createFifoReservationAllocationRecord({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        fifoLayerId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        reservedQuantity: '1.500',
      }),
    ];

    await service.releaseInventory({
      tenantId: TENANT_ID,
      reservationId: RESERVATION_ID,
      releaseQuantity: '2.500',
      transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
      releasedAt: RELEASED_AT,
      releasedByUserId: USER_ID,
    });

    expect(fifoReservationAllocationStore.releaseActiveAllocationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        allocationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        releasedAt: RELEASED_AT,
      },
      {
        tenantId: TENANT_ID,
        allocationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        releasedAt: RELEASED_AT,
      },
    ]);
    expect(fifoReservationAllocationStore.updateActiveAllocationQuantityInputs).toEqual([]);
    expect(reservationStore.activeReservation).toMatchObject({
      reservedQuantity: '1.500',
      status: 'active',
    });
    expect(fifoReservationAllocationStore.activeAllocations).toMatchObject([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '1.500',
        status: 'active',
        releasedAt: null,
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        status: 'released',
        releasedAt: RELEASED_AT,
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'released',
        releasedAt: RELEASED_AT,
      },
    ]);
  });

  it('blocks partial release quantity greater than active reserved quantity', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '1.000',
    });

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releaseQuantity: '1.001',
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'reservation_release_exceeds_reserved' })],
    });

    expect(stockStore.decrementReservedQuantityInputs).toEqual([]);
    expect(
      fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdateInputs,
    ).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('surfaces FIFO allocation conflict when partial allocation update returns null', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '1.500',
      availableQty: '8.500',
      lockVersion: 2,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '2.000',
      }),
    ];
    fifoReservationAllocationStore.returnNullOnUpdateActiveAllocationQuantity = true;

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releaseQuantity: '0.500',
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FIFO_ALLOCATION_CONFLICT,
      details: [expect.objectContaining({ code: 'fifo_allocation_release_conflict' })],
    });

    expect(reservationStore.decrementActiveReservationQuantityInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('surfaces FIFO allocation conflict when partial allocation release returns null', async () => {
    const { service, stockStore, reservationStore, fifoReservationAllocationStore, ledgerStore } =
      createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });
    stockStore.decrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '0.500',
      availableQty: '9.500',
      lockVersion: 2,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '1.000',
      }),
      createFifoReservationAllocationRecord({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reservedQuantity: '1.000',
      }),
    ];
    fifoReservationAllocationStore.returnNullOnReleaseActiveAllocation = true;

    await expect(
      service.releaseInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        releaseQuantity: '1.500',
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        releasedAt: RELEASED_AT,
        releasedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FIFO_ALLOCATION_CONFLICT,
      details: [expect.objectContaining({ code: 'fifo_allocation_release_conflict' })],
    });

    expect(reservationStore.decrementActiveReservationQuantityInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
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

  it('consumes an active reservation, creates FIFO consumptions, decrements stock and layers, and writes a consumption ledger entry', async () => {
    const {
      service,
      transactionRunner,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });
    stockStore.decrementedConsumedStockAvailability = createStockAvailabilityRecord({
      onHandQty: '8.000',
      reservedQty: '1.000',
      availableQty: '7.000',
      lockVersion: 3,
    });
    fifoLayerStore.allocationCandidates = [
      createFifoLayerAllocationCandidateRecord({
        id: FIFO_LAYER_ID_1,
        remainingQuantity: '5.000',
        unitCost: '100.00',
      }),
      createFifoLayerAllocationCandidateRecord({
        id: FIFO_LAYER_ID_2,
        remainingQuantity: '5.000',
        unitCost: '110.00',
      }),
    ];
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '1.500',
        unitCostSnapshot: '100.00',
      }),
      createFifoReservationAllocationRecord({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        reservedQuantity: '0.500',
        unitCostSnapshot: '110.00',
      }),
    ];

    const result = await service.consumeInventory({
      tenantId: TENANT_ID,
      reservationId: RESERVATION_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
      consumedAt: CONSUMED_AT,
      consumedByUserId: USER_ID,
    });

    expect(transactionRunner.runCount).toBe(1);
    expect(reservationStore.lockActiveReservationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(
      fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdateInputs,
    ).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityConsumed: '2.000',
      },
    ]);
    expect(fifoLayerStore.decrementRemainingQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '1.500',
      },
      {
        tenantId: TENANT_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '0.500',
      },
    ]);
    expect(fifoConsumptionStore.createConsumptionInputs).toMatchObject([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '1.500',
        unitCost: '100.00',
        totalCost: '150.00',
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        consumedAt: CONSUMED_AT,
      },
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '0.500',
        unitCost: '110.00',
        totalCost: '55.00',
        sourceType: 'job_order_line',
        sourceId: SOURCE_ID,
        consumedAt: CONSUMED_AT,
      },
    ]);
    expect(fifoReservationAllocationStore.markActiveAllocationsConsumedByReservationInputs).toEqual(
      [
        {
          tenantId: TENANT_ID,
          reservationId: RESERVATION_ID,
          allocationIds: [
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ],
          consumedAt: CONSUMED_AT,
        },
      ],
    );
    expect(reservationStore.markReservationConsumedInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        consumedAt: CONSUMED_AT,
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);
    expect(ledgerStore.createLedgerEntryInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
      quantityDeltaOnHand: '-2.000',
      quantityDeltaReserved: '-2.000',
      unitCost: null,
      totalCost: '205.00',
      sourceType: 'job_order_line',
      sourceId: SOURCE_ID,
      occurredAt: CONSUMED_AT,
      createdByUserId: USER_ID,
    });
    expect(result.reservation).toMatchObject({
      id: RESERVATION_ID,
      reservedQuantity: '0.000',
      status: 'consumed',
      consumedAt: CONSUMED_AT,
    });
    expect(result.fifoAllocations).toMatchObject([
      {
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        status: 'consumed',
        consumedAt: CONSUMED_AT,
      },
      {
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        status: 'consumed',
        consumedAt: CONSUMED_AT,
      },
    ]);
    expect(result.fifoConsumptions).toMatchObject([
      {
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '1.500',
        totalCost: '150.00',
      },
      {
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '0.500',
        totalCost: '55.00',
      },
    ]);
    expect(result.totalCost).toBe('205.00');
    expect(result.stockAvailability).toMatchObject({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      on_hand_qty: '8.000',
      reserved_qty: '1.000',
      available_qty: '7.000',
      lock_version: 3,
    });
  });

  it('fully receives an inventory transfer reservation and creates source transfer-out effects', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });

    const result = await service.consumeInventoryTransferReservationInTransaction(
      createTransferConsumptionCommand({ receivedQuantity: '5.000' }),
      {} as DatabaseQueryClient,
    );

    expect(reservationStore.lockActiveReservationInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(
      fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdateInputs,
    ).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
      },
    ]);
    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityConsumed: '5.000',
      },
    ]);
    expect(fifoLayerStore.decrementRemainingQuantityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '2.000',
      },
      {
        tenantId: TENANT_ID,
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '3.000',
      },
    ]);
    expect(fifoConsumptionStore.createConsumptionInputs).toMatchObject([
      {
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '2.000',
        unitCost: '10.00',
        totalCost: '20.00',
        sourceType: 'inventory_transfer_line',
        sourceId: SOURCE_ID,
      },
      {
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '3.000',
        unitCost: '12.00',
        totalCost: '36.00',
        sourceType: 'inventory_transfer_line',
        sourceId: SOURCE_ID,
      },
    ]);
    expect(fifoReservationAllocationStore.markActiveAllocationsConsumedByReservationInputs).toEqual(
      [
        {
          tenantId: TENANT_ID,
          reservationId: RESERVATION_ID,
          allocationIds: [
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ],
          consumedAt: CONSUMED_AT,
        },
      ],
    );
    expect(reservationStore.markReservationConsumedInputs).toEqual([
      {
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        consumedAt: CONSUMED_AT,
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toMatchObject([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_OUT,
        quantityDeltaOnHand: '-5.000',
        quantityDeltaReserved: '-5.000',
        totalCost: '56.00',
        sourceType: 'inventory_transfer_line',
        sourceId: SOURCE_ID,
      },
    ]);
    expect(result.reservation).toMatchObject({ status: 'consumed', reservedQuantity: '0.000' });
    expect(result.fifoAllocations).toMatchObject([
      { fifoLayerId: FIFO_LAYER_ID_1, status: 'consumed' },
      { fifoLayerId: FIFO_LAYER_ID_2, status: 'consumed' },
    ]);
    expect(result.sentQuantity).toBe('5.000');
    expect(result.receivedQuantity).toBe('5.000');
    expect(result.varianceQuantity).toBe('0.000');
    expect(result.transferOutCost).toBe('56.00');
    expect(result.varianceLossCost).toBe('0.00');
  });

  it('under-receives an inventory transfer and splits transfer-out and variance-loss cost', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });

    const result = await service.consumeInventoryTransferReservationInTransaction(
      createTransferConsumptionCommand({ receivedQuantity: '3.000' }),
      {} as DatabaseQueryClient,
    );

    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([
      expect.objectContaining({ quantityConsumed: '5.000' }),
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toMatchObject([
      {
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_OUT,
        quantityDeltaOnHand: '-3.000',
        quantityDeltaReserved: '-3.000',
        totalCost: '32.00',
      },
      {
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_VARIANCE_LOSS,
        quantityDeltaOnHand: '-2.000',
        quantityDeltaReserved: '-2.000',
        totalCost: '24.00',
      },
    ]);
    expect(result.varianceQuantity).toBe('2.000');
    expect(result.transferOutCost).toBe('32.00');
    expect(result.varianceLossCost).toBe('24.00');
  });

  it('treats zero received inventory transfer quantity as full variance loss', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });

    const result = await service.consumeInventoryTransferReservationInTransaction(
      createTransferConsumptionCommand({ receivedQuantity: '0' }),
      {} as DatabaseQueryClient,
    );

    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([
      expect.objectContaining({ quantityConsumed: '5.000' }),
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toMatchObject([
      {
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_VARIANCE_LOSS,
        quantityDeltaOnHand: '-5.000',
        quantityDeltaReserved: '-5.000',
        totalCost: '56.00',
      },
    ]);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);
    expect(result.receivedQuantity).toBe('0.000');
    expect(result.varianceQuantity).toBe('5.000');
    expect(result.transferOutCost).toBe('0.00');
    expect(result.varianceLossCost).toBe('56.00');
  });

  it('uses deterministic FIFO order for multi-layer transfer received and missing cost split', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });

    const result = await service.consumeInventoryTransferReservationInTransaction(
      createTransferConsumptionCommand({ receivedQuantity: '2.500' }),
      {} as DatabaseQueryClient,
    );

    expect(result.fifoConsumptions).toMatchObject([
      {
        fifoLayerId: FIFO_LAYER_ID_1,
        quantityConsumed: '2.000',
        unitCost: '10.00',
        totalCost: '20.00',
      },
      {
        fifoLayerId: FIFO_LAYER_ID_2,
        quantityConsumed: '3.000',
        unitCost: '12.00',
        totalCost: '36.00',
      },
    ]);
    expect(result.transferOutCost).toBe('26.00');
    expect(result.varianceLossCost).toBe('30.00');
    expect(result.varianceQuantity).toBe('2.500');
  });

  it.each([
    ['wrong expectedBranchId', { expectedBranchId: OTHER_BRANCH_ID }],
    ['wrong expectedProductId', { expectedProductId: OTHER_PRODUCT_ID }],
    ['wrong expectedSourceType', { expectedSourceType: 'job_order_line' }],
    ['wrong expectedSourceId', { expectedSourceId: OTHER_SOURCE_ID }],
    ['wrong expectedSentQuantity', { expectedSentQuantity: '4.000' }],
  ])('blocks transfer reservation mismatch before mutation: %s', async (_caseName, overrides) => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });

    await expect(
      service.consumeInventoryTransferReservationInTransaction(
        createTransferConsumptionCommand(overrides),
        {} as DatabaseQueryClient,
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'transfer_reservation_mismatch' })],
    });

    expectNoTransferConsumptionMutation({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    });
  });

  it('blocks unsupported transfer reservation source before mutation', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      reservationOverrides: { sourceType: 'job_order_line' },
    });

    await expect(
      service.consumeInventoryTransferReservationInTransaction(
        createTransferConsumptionCommand(),
        {} as DatabaseQueryClient,
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'transfer_reservation_mismatch' })],
    });

    expectNoTransferConsumptionMutation({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    });
  });

  it('blocks transfer consumption when active FIFO allocations do not match sent quantity', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservationId: RESERVATION_ID,
        fifoLayerId: FIFO_LAYER_ID_1,
        reservedQuantity: '4.000',
        unitCostSnapshot: '10.00',
      }),
    ];

    await expect(
      service.consumeInventoryTransferReservationInTransaction(
        createTransferConsumptionCommand(),
        {} as DatabaseQueryClient,
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FIFO_ALLOCATION_CONFLICT,
      details: [expect.objectContaining({ code: 'fifo_allocation_quantity_mismatch' })],
    });

    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([]);
    expect(fifoLayerStore.decrementRemainingQuantityInputs).toEqual([]);
    expect(fifoConsumptionStore.createConsumptionInputs).toEqual([]);
    expect(reservationStore.markReservationConsumedInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('rolls back transfer consumption effects when source stock cannot be decremented', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    setupTransferReservationForConsumption({
      stockStore,
      reservationStore,
      fifoLayerStore,
      fifoReservationAllocationStore,
      decrementedStockAvailability: null,
    });

    await expect(
      service.consumeInventoryTransferReservationInTransaction(
        createTransferConsumptionCommand(),
        {} as DatabaseQueryClient,
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'reservation_consumption_stock_conflict' })],
    });

    expect(reservationStore.activeReservation).toMatchObject({
      status: 'active',
      reservedQuantity: '5.000',
    });
    expect(fifoReservationAllocationStore.activeAllocations).toMatchObject([
      { fifoLayerId: FIFO_LAYER_ID_1, status: 'active' },
      { fifoLayerId: FIFO_LAYER_ID_2, status: 'active' },
    ]);
    expect(fifoLayerStore.decrementRemainingQuantityInputs).toEqual([]);
    expect(fifoConsumptionStore.createConsumptionInputs).toEqual([]);
    expect(reservationStore.markReservationConsumedInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('blocks consumption when reservation is missing or not active', async () => {
    const {
      service,
      stockStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    await expect(
      service.consumeInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        consumedAt: CONSUMED_AT,
        consumedByUserId: USER_ID,
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

    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([]);
    expect(
      fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdateInputs,
    ).toEqual([]);
    expect(fifoConsumptionStore.createConsumptionInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('blocks consumption when active FIFO allocations do not match reserved quantity', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      ledgerStore,
    } = createService();

    reservationStore.activeReservation = createInventoryReservationRecord({
      id: RESERVATION_ID,
      reservedQuantity: '2.000',
    });
    fifoReservationAllocationStore.activeAllocations = [
      createFifoReservationAllocationRecord({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reservedQuantity: '1.000',
      }),
    ];

    await expect(
      service.consumeInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        consumedAt: CONSUMED_AT,
        consumedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FIFO_ALLOCATION_CONFLICT,
      details: [
        {
          field: 'reservation_id',
          code: 'fifo_allocation_quantity_mismatch',
        },
      ],
    });

    expect(stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([]);
    expect(fifoConsumptionStore.createConsumptionInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('rejects unsupported reservation consumption transaction types before opening a transaction', async () => {
    const { service, transactionRunner } = createService();

    await expect(
      service.consumeInventory({
        tenantId: TENANT_ID,
        reservationId: RESERVATION_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
        consumedAt: CONSUMED_AT,
        consumedByUserId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'transaction_type',
          code: 'unsupported_inventory_reservation_consumption_transaction_type',
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
  readonly fifoConsumptionStore: FakeFifoConsumptionStore;
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
  const fifoConsumptionStore = new FakeFifoConsumptionStore();

  return {
    service: new InventoryReservationService(
      reservationStore,
      stockBalancesService,
      fifoLayerService,
      fifoReservationAllocationStore,
      fifoConsumptionStore,
      stockStore,
      ledgerService,
      transactionRunner,
    ),
    transactionRunner,
    stockStore,
    fifoConsumptionStore,
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

function createTransferConsumptionCommand(
  overrides: Partial<
    Parameters<InventoryReservationService['consumeInventoryTransferReservationInTransaction']>[0]
  > = {},
): Parameters<InventoryReservationService['consumeInventoryTransferReservationInTransaction']>[0] {
  return {
    tenantId: TENANT_ID,
    reservationId: RESERVATION_ID,
    receivedQuantity: '5.000',
    expectedSentQuantity: '5.000',
    expectedBranchId: BRANCH_ID,
    expectedProductId: PRODUCT_ID,
    expectedSourceType: 'inventory_transfer_line',
    expectedSourceId: SOURCE_ID,
    consumedAt: CONSUMED_AT,
    consumedByUserId: USER_ID,
    ...overrides,
  };
}

function setupTransferReservationForConsumption(input: {
  readonly stockStore: FakeStockBalanceStore;
  readonly reservationStore: FakeInventoryReservationStore;
  readonly fifoLayerStore: FakeFifoLayerStore;
  readonly fifoReservationAllocationStore: FakeFifoReservationAllocationStore;
  readonly reservationOverrides?: Partial<InventoryReservationRecord>;
  readonly decrementedStockAvailability?: StockAvailabilityRecord | null;
}): void {
  input.reservationStore.activeReservation = createInventoryReservationRecord({
    id: RESERVATION_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    sourceType: 'inventory_transfer_line',
    sourceId: SOURCE_ID,
    requestedQuantity: '5.000',
    reservedQuantity: '5.000',
    status: 'active',
    ...input.reservationOverrides,
  });
  input.stockStore.decrementedConsumedStockAvailability =
    input.decrementedStockAvailability === undefined
      ? createStockAvailabilityRecord({
          onHandQty: '5.000',
          reservedQty: '0.000',
          availableQty: '5.000',
          lockVersion: 3,
        })
      : input.decrementedStockAvailability;
  input.fifoLayerStore.allocationCandidates = [
    createFifoLayerAllocationCandidateRecord({
      id: FIFO_LAYER_ID_1,
      remainingQuantity: '2.000',
      unitCost: '10.00',
    }),
    createFifoLayerAllocationCandidateRecord({
      id: FIFO_LAYER_ID_2,
      remainingQuantity: '3.000',
      unitCost: '12.00',
    }),
  ];
  input.fifoReservationAllocationStore.activeAllocations = [
    createFifoReservationAllocationRecord({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      reservationId: RESERVATION_ID,
      fifoLayerId: FIFO_LAYER_ID_1,
      reservedQuantity: '2.000',
      unitCostSnapshot: '10.00',
    }),
    createFifoReservationAllocationRecord({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reservationId: RESERVATION_ID,
      fifoLayerId: FIFO_LAYER_ID_2,
      reservedQuantity: '3.000',
      unitCostSnapshot: '12.00',
    }),
  ];
}

function expectNoTransferConsumptionMutation(input: {
  readonly stockStore: FakeStockBalanceStore;
  readonly reservationStore: FakeInventoryReservationStore;
  readonly fifoLayerStore: FakeFifoLayerStore;
  readonly fifoReservationAllocationStore: FakeFifoReservationAllocationStore;
  readonly fifoConsumptionStore: FakeFifoConsumptionStore;
  readonly ledgerStore: FakeInventoryLedgerStore;
}): void {
  expect(input.stockStore.decrementOnHandAndReservedQuantityInputs).toEqual([]);
  expect(
    input.fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdateInputs,
  ).toEqual([]);
  expect(input.fifoLayerStore.decrementRemainingQuantityInputs).toEqual([]);
  expect(
    input.fifoReservationAllocationStore.markActiveAllocationsConsumedByReservationInputs,
  ).toEqual([]);
  expect(input.reservationStore.markReservationConsumedInputs).toEqual([]);
  expect(input.fifoConsumptionStore.createConsumptionInputs).toEqual([]);
  expect(input.ledgerStore.createLedgerEntryInputs).toEqual([]);
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
  decrementedConsumedStockAvailability: StockAvailabilityRecord | null = null;

  readonly lockAvailabilityInputs: GetStockAvailabilityInput[] = [];
  readonly incrementReservedQuantityInputs: IncrementReservedQuantityInput[] = [];
  readonly decrementReservedQuantityInputs: DecrementReservedQuantityInput[] = [];
  readonly decrementOnHandAndReservedQuantityInputs: DecrementOnHandAndReservedQuantityInput[] = [];

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

  async decrementOnHandAndReservedQuantity(
    input: DecrementOnHandAndReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.decrementOnHandAndReservedQuantityInputs.push(input);

    return this.decrementedConsumedStockAvailability;
  }
}

class FakeFifoLayerStore extends FifoLayerStore {
  allocationCandidates: readonly FifoLayerAllocationCandidateRecord[] = [
    createFifoLayerAllocationCandidateRecord(),
  ];

  readonly lockOpenLayersForAllocationInputs: LockOpenFifoLayersForAllocationInput[] = [];
  readonly decrementRemainingQuantityInputs: DecrementFifoLayerRemainingQuantityInput[] = [];

  async createLayer(input: CreateFifoLayerInput): Promise<FifoLayerRecord> {
    return input;
  }

  async lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    this.lockOpenLayersForAllocationInputs.push(input);

    return this.allocationCandidates;
  }

  async decrementRemainingQuantity(
    input: DecrementFifoLayerRemainingQuantityInput,
  ): Promise<FifoLayerRecord | null> {
    this.decrementRemainingQuantityInputs.push(input);

    const layer = this.allocationCandidates.find((candidate) => candidate.id === input.fifoLayerId);

    return layer ?? null;
  }
}

class FakeInventoryReservationStore extends InventoryReservationStore {
  activeReservation: InventoryReservationRecord | null = null;

  readonly createReservationInputs: CreateInventoryReservationInput[] = [];
  readonly lockActiveReservationInputs: LockInventoryReservationInput[] = [];
  readonly markReservationReleasedInputs: ReleaseInventoryReservationInput[] = [];
  readonly decrementActiveReservationQuantityInputs: PartiallyReleaseInventoryReservationInput[] =
    [];
  readonly markReservationConsumedInputs: ConsumeInventoryReservationInput[] = [];

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

  async decrementActiveReservationQuantity(
    input: PartiallyReleaseInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    this.decrementActiveReservationQuantityInputs.push(input);

    if (this.activeReservation === null) {
      return null;
    }

    const releasedReservation: InventoryReservationRecord = {
      ...this.activeReservation,
      reservedQuantity: subtractQuantities(
        this.activeReservation.reservedQuantity,
        input.releaseQuantity,
      ),
      status: 'active',
      releasedAt: null,
    };

    this.activeReservation = releasedReservation;

    return releasedReservation;
  }

  async markReservationConsumed(
    input: ConsumeInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    this.markReservationConsumedInputs.push(input);

    if (this.activeReservation === null) {
      return null;
    }

    const consumedReservation: InventoryReservationRecord = {
      ...this.activeReservation,
      reservedQuantity: '0.000',
      status: 'consumed',
      consumedAt: input.consumedAt,
    };

    this.activeReservation = consumedReservation;

    return consumedReservation;
  }
}

class FakeFifoReservationAllocationStore extends FifoReservationAllocationStore {
  activeAllocations: readonly FifoReservationAllocationRecord[] = [
    createFifoReservationAllocationRecord(),
  ];
  returnNullOnUpdateActiveAllocationQuantity = false;
  returnNullOnReleaseActiveAllocation = false;

  readonly createAllocationInputs: CreateFifoReservationAllocationInput[] = [];
  readonly releaseActiveAllocationsByReservationInputs: ReleaseFifoReservationAllocationsInput[] =
    [];
  readonly lockActiveAllocationsByReservationForUpdateInputs: LockFifoReservationAllocationsInput[] =
    [];
  readonly updateActiveAllocationQuantityInputs: UpdateFifoReservationAllocationQuantityInput[] =
    [];
  readonly releaseActiveAllocationInputs: ReleaseFifoReservationAllocationInput[] = [];
  readonly markActiveAllocationsConsumedByReservationInputs: ConsumeFifoReservationAllocationsInput[] =
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

  async lockActiveAllocationsByReservationForUpdate(
    input: LockFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    this.lockActiveAllocationsByReservationForUpdateInputs.push(input);

    return this.activeAllocations;
  }

  async updateActiveAllocationQuantity(
    input: UpdateFifoReservationAllocationQuantityInput,
  ): Promise<FifoReservationAllocationRecord | null> {
    this.updateActiveAllocationQuantityInputs.push(input);

    if (this.returnNullOnUpdateActiveAllocationQuantity) {
      return null;
    }

    const allocation = this.activeAllocations.find(
      (candidate) => candidate.id === input.allocationId,
    );

    if (allocation === undefined) {
      return null;
    }

    const updatedAllocation = {
      ...allocation,
      reservedQuantity: input.reservedQuantity,
    };

    this.activeAllocations = this.activeAllocations.map((candidate) =>
      candidate.id === input.allocationId ? updatedAllocation : candidate,
    );

    return updatedAllocation;
  }

  async releaseActiveAllocation(
    input: ReleaseFifoReservationAllocationInput,
  ): Promise<FifoReservationAllocationRecord | null> {
    this.releaseActiveAllocationInputs.push(input);

    if (this.returnNullOnReleaseActiveAllocation) {
      return null;
    }

    const allocation = this.activeAllocations.find(
      (candidate) => candidate.id === input.allocationId,
    );

    if (allocation === undefined) {
      return null;
    }

    const releasedAllocation = {
      ...allocation,
      status: 'released' as const,
      releasedAt: input.releasedAt,
    };

    this.activeAllocations = this.activeAllocations.map((candidate) =>
      candidate.id === input.allocationId ? releasedAllocation : candidate,
    );

    return releasedAllocation;
  }

  async markActiveAllocationsConsumedByReservation(
    input: ConsumeFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    this.markActiveAllocationsConsumedByReservationInputs.push(input);

    return this.activeAllocations
      .filter((allocation) => input.allocationIds.includes(allocation.id))
      .map((allocation) => ({
        ...allocation,
        status: 'consumed',
        consumedAt: input.consumedAt,
      }));
  }
}

class FakeFifoConsumptionStore extends FifoConsumptionStore {
  readonly createConsumptionInputs: CreateFifoConsumptionInput[] = [];

  async createConsumptions(
    inputs: readonly CreateFifoConsumptionInput[],
  ): Promise<readonly FifoConsumptionRecord[]> {
    this.createConsumptionInputs.push(...inputs);

    return inputs;
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

function subtractQuantities(left: string, right: string): string {
  return formatQuantityUnits(parseQuantityUnits(left) - parseQuantityUnits(right));
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const decimalPart = value % 1000n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}
