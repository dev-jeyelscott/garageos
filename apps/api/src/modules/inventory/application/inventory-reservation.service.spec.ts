import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  DatabaseTransactionRunner,
  DatabaseTransactionWork,
} from '../../../shared/database/database-transaction';
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
} from './inventory-reservation.store';
import { InventoryStockBalancesService } from './inventory-stock-balances.service';
import {
  StockBalanceStore,
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
const RESERVED_AT = new Date('2026-06-28T12:00:00.000Z');

describe('InventoryReservationService', () => {
  it('creates an active reservation, increments reserved stock, and writes a ledger entry', async () => {
    const { service, transactionRunner, stockStore, reservationStore, ledgerStore } =
      createService();
    stockStore.stockAvailability = createStockAvailabilityRecord();
    stockStore.incrementedStockAvailability = createStockAvailabilityRecord({
      reservedQty: '5.000',
      availableQty: '5.000',
      lockVersion: 1,
    });

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

    expect(transactionRunner.runCount).toBe(1);
    expect(stockStore.lockAvailabilityInputs).toEqual([
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

  it('blocks reservation when available stock is insufficient', async () => {
    const { service, stockStore, reservationStore, ledgerStore } = createService();
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

    expect(reservationStore.createReservationInputs).toEqual([]);
    expect(stockStore.incrementReservedQuantityInputs).toEqual([]);
    expect(ledgerStore.createLedgerEntryInputs).toEqual([]);
  });

  it('supports inventory transfer reservation transaction type without allocating FIFO yet', async () => {
    const { service, stockStore, reservationStore, ledgerStore } = createService();
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

    expect(reservationStore.createReservationInputs[0]).toMatchObject({
      sourceType: 'inventory_transfer_line',
      requestedQuantity: '1.000',
      reservedQuantity: '1.000',
      status: 'active',
    });
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
  readonly reservationStore: FakeInventoryReservationStore;
  readonly ledgerStore: FakeInventoryLedgerStore;
} {
  const transactionRunner = new FakeTransactionRunner();
  const stockStore = new FakeStockBalanceStore();
  const reservationStore = new FakeInventoryReservationStore();
  const ledgerStore = new FakeInventoryLedgerStore();
  const stockBalancesService = new InventoryStockBalancesService(stockStore);
  const ledgerService = new InventoryLedgerService(ledgerStore);

  return {
    service: new InventoryReservationService(
      reservationStore,
      stockBalancesService,
      stockStore,
      ledgerService,
      transactionRunner,
    ),
    transactionRunner,
    stockStore,
    reservationStore,
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

  readonly lockAvailabilityInputs: GetStockAvailabilityInput[] = [];
  readonly incrementReservedQuantityInputs: IncrementReservedQuantityInput[] = [];

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
}

class FakeInventoryReservationStore extends InventoryReservationStore {
  readonly createReservationInputs: CreateInventoryReservationInput[] = [];

  async createReservation(
    input: CreateInventoryReservationInput,
  ): Promise<InventoryReservationRecord> {
    this.createReservationInputs.push(input);

    return input;
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
