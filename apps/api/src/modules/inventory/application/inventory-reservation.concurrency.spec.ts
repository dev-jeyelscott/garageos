import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  DatabaseTransactionRunner,
  DatabaseTransactionWork,
} from '../../../shared/database/database-transaction';
import {
  FifoConsumptionStore,
  type CreateFifoConsumptionInput,
  type FifoConsumptionRecord,
} from './fifo-consumption.store';
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
  FIFO_ALLOCATION_STATUSES,
  FifoReservationAllocationStore,
  type ConsumeFifoReservationAllocationsInput,
  type CreateFifoReservationAllocationInput,
  type FifoReservationAllocationRecord,
  type LockFifoReservationAllocationsInput,
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
  INVENTORY_RESERVATION_STATUSES,
  InventoryReservationStore,
  type ConsumeInventoryReservationInput,
  type CreateInventoryReservationInput,
  type InventoryReservationRecord,
  type LockInventoryReservationInput,
  type ReleaseInventoryReservationInput,
} from './inventory-reservation.store';
import { InventoryStockBalancesService } from './inventory-stock-balances.service';
import {
  StockBalanceStore,
  type DecrementOnHandAndReservedQuantityInput,
  type DecrementReservedQuantityInput,
  type IncrementReservedQuantityInput,
  type ListStockBalancesInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from './stock-balance.store';
import {
  FIFO_FIXTURE_DATES,
  FIFO_FIXTURE_EXPECTED,
  FIFO_FIXTURE_IDS,
  createDeterministicActiveFifoReservationAllocations,
  createDeterministicFifoLayerAllocationCandidateRecord,
  createDeterministicFifoLayerAllocationCandidates,
  createDeterministicInventoryReservationRecord,
  createDeterministicStockAvailabilityRecord,
} from '../testing/inventory-fifo-fixtures';

const SECOND_JOB_ORDER_PART_LINE_SOURCE = '66666666-6666-4666-8666-666666666667';

describe('InventoryReservationService concurrency', () => {
  it('serializes concurrent reservations and blocks over-reservation before FIFO allocation', async () => {
    const { service, stockStore, reservationStore, fifoLayerStore, allocationStore, ledgerStore } =
      createStatefulService({
        stockAvailability: createDeterministicStockAvailabilityRecord({
          onHandQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
          reservedQty: '0.000',
          availableQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
        }),
      });

    const results = await Promise.allSettled([
      service.reserveInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
        productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
        sourceType: 'job_order_line',
        sourceId: FIFO_FIXTURE_IDS.JOB_ORDER_PART_LINE_SOURCE,
        requestedQuantity: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
        createdByUserId: FIFO_FIXTURE_IDS.USER,
      }),
      service.reserveInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
        productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
        sourceType: 'job_order_line',
        sourceId: SECOND_JOB_ORDER_PART_LINE_SOURCE,
        requestedQuantity: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
        createdByUserId: FIFO_FIXTURE_IDS.USER,
      }),
    ]);

    const fulfilled = getFulfilledResults(results);
    const rejected = getRejectedResults(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: API_ERROR_CODES.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
    });

    expect(stockStore.getAvailability()).toMatchObject({
      onHandQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
      reservedQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
      availableQty: '0.000',
    });
    expect(reservationStore.listReservations()).toHaveLength(1);
    expect(allocationStore.listAllocations()).toHaveLength(2);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);

    expect(fifoLayerStore.lockOpenLayersForAllocationInputs).toEqual([
      {
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
        productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
      },
    ]);
  });

  it('serializes concurrent FIFO allocation from oldest available layers without over-allocating a shared layer', async () => {
    const { service, stockStore, allocationStore } = createStatefulService({
      stockAvailability: createDeterministicStockAvailabilityRecord({
        onHandQty: '2.000',
        reservedQty: '0.000',
        availableQty: '2.000',
      }),
      fifoLayers: [
        createDeterministicFifoLayerAllocationCandidateRecord({
          activeReservedQuantity: '0.000',
          allocatableQuantity: '1.500',
        }),
        createDeterministicFifoLayerAllocationCandidateRecord({
          id: FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
          quantityReceived: '5.000',
          remainingQuantity: '5.000',
          unitCost: FIFO_FIXTURE_EXPECTED.MIDDLE_UNIT_COST,
          sourceTransactionId: FIFO_FIXTURE_IDS.PURCHASE_RECEIVE_MIDDLE,
          receivedAt: FIFO_FIXTURE_DATES.RECEIVED_MIDDLE,
          activeReservedQuantity: '0.000',
          allocatableQuantity: '5.000',
        }),
      ],
    });

    const results = await Promise.all([
      service.reserveInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
        productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
        sourceType: 'job_order_line',
        sourceId: FIFO_FIXTURE_IDS.JOB_ORDER_PART_LINE_SOURCE,
        requestedQuantity: '1.000',
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
        createdByUserId: FIFO_FIXTURE_IDS.USER,
      }),
      service.reserveInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        branchId: FIFO_FIXTURE_IDS.BRANCH_MAIN,
        productId: FIFO_FIXTURE_IDS.PRODUCT_ENGINE_OIL,
        sourceType: 'job_order_line',
        sourceId: SECOND_JOB_ORDER_PART_LINE_SOURCE,
        requestedQuantity: '1.000',
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
        reservedAt: FIFO_FIXTURE_DATES.RESERVED_AT,
        createdByUserId: FIFO_FIXTURE_IDS.USER,
      }),
    ]);

    expect(results.flatMap((result) => result.fifoAllocations)).toMatchObject([
      {
        fifoLayerId: FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
        reservedQuantity: '1.000',
      },
      {
        fifoLayerId: FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
        reservedQuantity: '0.500',
      },
      {
        fifoLayerId: FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
        reservedQuantity: '0.500',
      },
    ]);

    expect(allocationStore.getActiveReservedQuantityByLayer()).toEqual(
      new Map<string, bigint>([
        [FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST, 1500n],
        [FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE, 500n],
      ]),
    );
    expect(stockStore.getAvailability()).toMatchObject({
      onHandQty: '2.000',
      reservedQty: '2.000',
      availableQty: '0.000',
    });
  });

  it('allows only one concurrent consumption of the same active reservation', async () => {
    const {
      service,
      stockStore,
      reservationStore,
      fifoLayerStore,
      allocationStore,
      consumptionStore,
      ledgerStore,
    } = createStatefulService({
      stockAvailability: createDeterministicStockAvailabilityRecord({
        onHandQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
        reservedQty: FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
        availableQty: '0.000',
      }),
      activeReservation: createDeterministicInventoryReservationRecord(),
      activeAllocations: createDeterministicActiveFifoReservationAllocations(),
    });

    const results = await Promise.allSettled([
      service.consumeInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        reservationId: FIFO_FIXTURE_IDS.RESERVATION,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        consumedAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
        consumedByUserId: FIFO_FIXTURE_IDS.USER,
      }),
      service.consumeInventory({
        tenantId: FIFO_FIXTURE_IDS.TENANT,
        reservationId: FIFO_FIXTURE_IDS.RESERVATION,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        consumedAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
        consumedByUserId: FIFO_FIXTURE_IDS.USER,
      }),
    ]);

    const fulfilled = getFulfilledResults(results);
    const rejected = getRejectedResults(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]?.value.totalCost).toBe(FIFO_FIXTURE_EXPECTED.TOTAL_CONSUMPTION_COST);
    expect(rejected[0]?.reason).toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [
        {
          field: 'reservation_id',
          code: 'reservation_not_active',
        },
      ],
    });

    expect(reservationStore.getReservation(FIFO_FIXTURE_IDS.RESERVATION)).toMatchObject({
      status: INVENTORY_RESERVATION_STATUSES.CONSUMED,
      reservedQuantity: '0.000',
      consumedAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
    });
    expect(allocationStore.listAllocations()).toMatchObject([
      {
        id: FIFO_FIXTURE_IDS.FIFO_ALLOCATION_OLDEST,
        status: FIFO_ALLOCATION_STATUSES.CONSUMED,
        consumedAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
      },
      {
        id: FIFO_FIXTURE_IDS.FIFO_ALLOCATION_MIDDLE,
        status: FIFO_ALLOCATION_STATUSES.CONSUMED,
        consumedAt: FIFO_FIXTURE_DATES.CONSUMED_AT,
      },
    ]);
    expect(consumptionStore.createConsumptionInputs).toHaveLength(2);
    expect(ledgerStore.createLedgerEntryInputs).toHaveLength(1);
    expect(stockStore.getAvailability()).toMatchObject({
      onHandQty: '0.000',
      reservedQty: '0.000',
      availableQty: '0.000',
    });
    expect(fifoLayerStore.getRemainingQuantity(FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST)).toBe('0.000');
    expect(fifoLayerStore.getRemainingQuantity(FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE)).toBe('4.500');
  });
});

interface SnapshotCapableStore {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

interface StatefulServiceOptions {
  readonly stockAvailability?: StockAvailabilityRecord;
  readonly fifoLayers?: readonly FifoLayerAllocationCandidateRecord[];
  readonly activeReservation?: InventoryReservationRecord;
  readonly activeAllocations?: readonly FifoReservationAllocationRecord[];
}

function createStatefulService(options: StatefulServiceOptions = {}): {
  readonly service: InventoryReservationService;
  readonly stockStore: StatefulStockBalanceStore;
  readonly fifoLayerStore: StatefulFifoLayerStore;
  readonly reservationStore: StatefulInventoryReservationStore;
  readonly allocationStore: StatefulFifoReservationAllocationStore;
  readonly consumptionStore: StatefulFifoConsumptionStore;
  readonly ledgerStore: StatefulInventoryLedgerStore;
} {
  const stockStore = new StatefulStockBalanceStore(
    options.stockAvailability ?? createDeterministicStockAvailabilityRecord(),
  );
  const reservationStore = new StatefulInventoryReservationStore(
    options.activeReservation === undefined ? [] : [options.activeReservation],
  );
  const allocationStore = new StatefulFifoReservationAllocationStore(
    options.activeAllocations ?? [],
  );
  const fifoLayerStore = new StatefulFifoLayerStore(
    options.fifoLayers ?? createDeterministicFifoLayerAllocationCandidates(),
    () => allocationStore.getActiveReservedQuantityByLayer(),
  );
  const consumptionStore = new StatefulFifoConsumptionStore();
  const ledgerStore = new StatefulInventoryLedgerStore();
  const transactionRunner = new SerialRollbackTransactionRunner([
    stockStore,
    reservationStore,
    allocationStore,
    fifoLayerStore,
    consumptionStore,
    ledgerStore,
  ]);

  const stockBalancesService = new InventoryStockBalancesService(stockStore);
  const fifoLayerService = new FifoLayerService(fifoLayerStore);
  const ledgerService = new InventoryLedgerService(ledgerStore);

  return {
    service: new InventoryReservationService(
      reservationStore,
      stockBalancesService,
      fifoLayerService,
      allocationStore,
      consumptionStore,
      stockStore,
      ledgerService,
      transactionRunner,
    ),
    stockStore,
    fifoLayerStore,
    reservationStore,
    allocationStore,
    consumptionStore,
    ledgerStore,
  };
}

class SerialRollbackTransactionRunner implements DatabaseTransactionRunner {
  private readonly transactionClient = {} as DatabaseQueryClient;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly stores: readonly SnapshotCapableStore[]) {}

  runInTransaction<Result>(work: DatabaseTransactionWork<Result>): Promise<Result> {
    const next = this.queue.then(async () => {
      const snapshots = this.stores.map((store) => store.snapshot());

      try {
        return await work(this.transactionClient);
      } catch (error) {
        for (let index = 0; index < this.stores.length; index += 1) {
          this.stores[index]?.restore(snapshots[index]);
        }

        throw error;
      }
    });

    this.queue = next.catch(() => undefined);

    return next;
  }
}

interface StockSnapshot {
  readonly onHandUnits: bigint;
  readonly reservedUnits: bigint;
  readonly lockVersion: number;
}

class StatefulStockBalanceStore extends StockBalanceStore implements SnapshotCapableStore {
  private onHandUnits: bigint;
  private reservedUnits: bigint;
  private lockVersion: number;

  constructor(stockAvailability: StockAvailabilityRecord) {
    super();

    this.onHandUnits = parseQuantityUnits(stockAvailability.onHandQty);
    this.reservedUnits = parseQuantityUnits(stockAvailability.reservedQty);
    this.lockVersion = stockAvailability.lockVersion;
  }

  snapshot(): StockSnapshot {
    return {
      onHandUnits: this.onHandUnits,
      reservedUnits: this.reservedUnits,
      lockVersion: this.lockVersion,
    };
  }

  restore(snapshot: unknown): void {
    const state = snapshot as StockSnapshot;

    this.onHandUnits = state.onHandUnits;
    this.reservedUnits = state.reservedUnits;
    this.lockVersion = state.lockVersion;
  }

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async listStockBalances(_input: ListStockBalancesInput): Promise<readonly StockBalanceRecord[]> {
    return [];
  }

  async getStockAvailability(): Promise<StockAvailabilityRecord> {
    return this.getAvailability();
  }

  async lockStockAvailabilityForUpdate(): Promise<StockAvailabilityRecord> {
    return this.getAvailability();
  }

  async incrementReservedQuantity(
    input: IncrementReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    const deltaUnits = parseQuantityUnits(input.reservedQuantityDelta);

    if (this.availableUnits < deltaUnits) {
      return null;
    }

    this.reservedUnits += deltaUnits;
    this.lockVersion += 1;

    return this.getAvailability();
  }

  async decrementReservedQuantity(
    input: DecrementReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    const deltaUnits = parseQuantityUnits(input.reservedQuantityDelta);

    if (this.reservedUnits < deltaUnits) {
      return null;
    }

    this.reservedUnits -= deltaUnits;
    this.lockVersion += 1;

    return this.getAvailability();
  }

  async decrementOnHandAndReservedQuantity(
    input: DecrementOnHandAndReservedQuantityInput,
  ): Promise<StockAvailabilityRecord | null> {
    const consumedUnits = parseQuantityUnits(input.quantityConsumed);

    if (this.onHandUnits < consumedUnits || this.reservedUnits < consumedUnits) {
      return null;
    }

    this.onHandUnits -= consumedUnits;
    this.reservedUnits -= consumedUnits;
    this.lockVersion += 1;

    return this.getAvailability();
  }

  getAvailability(): StockAvailabilityRecord {
    return createDeterministicStockAvailabilityRecord({
      onHandQty: formatQuantityUnits(this.onHandUnits),
      reservedQty: formatQuantityUnits(this.reservedUnits),
      availableQty: formatQuantityUnits(this.availableUnits),
      lockVersion: this.lockVersion,
    });
  }

  private get availableUnits(): bigint {
    return this.onHandUnits - this.reservedUnits;
  }
}

interface MutableFifoLayerState {
  readonly base: FifoLayerAllocationCandidateRecord;
  remainingUnits: bigint;
  readonly preExistingActiveReservedUnits: bigint;
}

type FifoLayerSnapshot = readonly MutableFifoLayerState[];

class StatefulFifoLayerStore extends FifoLayerStore implements SnapshotCapableStore {
  readonly lockOpenLayersForAllocationInputs: LockOpenFifoLayersForAllocationInput[] = [];

  private layersById = new Map<string, MutableFifoLayerState>();

  constructor(
    layers: readonly FifoLayerAllocationCandidateRecord[],
    private readonly getActiveReservedQuantityByLayer: () => ReadonlyMap<string, bigint>,
  ) {
    super();

    this.layersById = createLayerStateMap(layers);
  }

  snapshot(): FifoLayerSnapshot {
    return Array.from(this.layersById.values()).map((layer) => ({
      base: layer.base,
      remainingUnits: layer.remainingUnits,
      preExistingActiveReservedUnits: layer.preExistingActiveReservedUnits,
    }));
  }

  restore(snapshot: unknown): void {
    this.layersById = new Map(
      (snapshot as FifoLayerSnapshot).map((layer) => [
        layer.base.id,
        {
          base: layer.base,
          remainingUnits: layer.remainingUnits,
          preExistingActiveReservedUnits: layer.preExistingActiveReservedUnits,
        },
      ]),
    );
  }

  async createLayer(input: CreateFifoLayerInput): Promise<FifoLayerRecord> {
    const layer = createDeterministicFifoLayerAllocationCandidateRecord({
      ...input,
      activeReservedQuantity: '0.000',
      allocatableQuantity: input.remainingQuantity,
    });

    this.layersById.set(input.id, {
      base: layer,
      remainingUnits: parseQuantityUnits(input.remainingQuantity),
      preExistingActiveReservedUnits: 0n,
    });

    return input;
  }

  async lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    this.lockOpenLayersForAllocationInputs.push(input);

    const activeReservedQuantityByLayer = this.getActiveReservedQuantityByLayer();

    return Array.from(this.layersById.values())
      .filter((layer) => layer.remainingUnits > 0n)
      .sort(compareLayerStateByFifoOrder)
      .map((layer) => {
        const activeReservedUnits =
          layer.preExistingActiveReservedUnits +
          (activeReservedQuantityByLayer.get(layer.base.id) ?? 0n);
        const allocatableUnits = layer.remainingUnits - activeReservedUnits;

        if (allocatableUnits <= 0n) {
          return null;
        }

        return {
          ...layer.base,
          remainingQuantity: formatQuantityUnits(layer.remainingUnits),
          activeReservedQuantity: formatQuantityUnits(activeReservedUnits),
          allocatableQuantity: formatQuantityUnits(allocatableUnits),
        };
      })
      .filter(isPresent);
  }

  async decrementRemainingQuantity(
    input: DecrementFifoLayerRemainingQuantityInput,
  ): Promise<FifoLayerRecord | null> {
    const layer = this.layersById.get(input.fifoLayerId);

    if (layer === undefined) {
      return null;
    }

    const consumedUnits = parseQuantityUnits(input.quantityConsumed);

    if (layer.remainingUnits < consumedUnits) {
      return null;
    }

    layer.remainingUnits -= consumedUnits;

    return {
      id: layer.base.id,
      tenantId: layer.base.tenantId,
      branchId: layer.base.branchId,
      productId: layer.base.productId,
      quantityReceived: layer.base.quantityReceived,
      remainingQuantity: formatQuantityUnits(layer.remainingUnits),
      unitCost: layer.base.unitCost,
      sourceTransactionType: layer.base.sourceTransactionType,
      sourceTransactionId: layer.base.sourceTransactionId,
      receivedAt: layer.base.receivedAt,
      originalSourceLayerId: layer.base.originalSourceLayerId,
    };
  }

  getRemainingQuantity(fifoLayerId: string): string | null {
    const layer = this.layersById.get(fifoLayerId);

    return layer === undefined ? null : formatQuantityUnits(layer.remainingUnits);
  }
}

class StatefulInventoryReservationStore
  extends InventoryReservationStore
  implements SnapshotCapableStore
{
  private reservationsById = new Map<string, InventoryReservationRecord>();

  constructor(reservations: readonly InventoryReservationRecord[]) {
    super();

    this.reservationsById = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );
  }

  snapshot(): readonly InventoryReservationRecord[] {
    return this.listReservations();
  }

  restore(snapshot: unknown): void {
    this.reservationsById = new Map(
      (snapshot as readonly InventoryReservationRecord[]).map((reservation) => [
        reservation.id,
        reservation,
      ]),
    );
  }

  async createReservation(
    input: CreateInventoryReservationInput,
  ): Promise<InventoryReservationRecord> {
    this.reservationsById.set(input.id, input);

    return input;
  }

  async lockActiveReservationForUpdate(
    input: LockInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    const reservation = this.reservationsById.get(input.reservationId);

    if (
      reservation === undefined ||
      reservation.tenantId !== input.tenantId ||
      reservation.status !== INVENTORY_RESERVATION_STATUSES.ACTIVE
    ) {
      return null;
    }

    return reservation;
  }

  async markReservationReleased(
    input: ReleaseInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    const reservation = this.reservationsById.get(input.reservationId);

    if (
      reservation === undefined ||
      reservation.tenantId !== input.tenantId ||
      reservation.status !== INVENTORY_RESERVATION_STATUSES.ACTIVE
    ) {
      return null;
    }

    const releasedReservation: InventoryReservationRecord = {
      ...reservation,
      reservedQuantity: '0.000',
      status: INVENTORY_RESERVATION_STATUSES.RELEASED,
      releasedAt: input.releasedAt,
    };

    this.reservationsById.set(input.reservationId, releasedReservation);

    return releasedReservation;
  }

  async markReservationConsumed(
    input: ConsumeInventoryReservationInput,
  ): Promise<InventoryReservationRecord | null> {
    const reservation = this.reservationsById.get(input.reservationId);

    if (
      reservation === undefined ||
      reservation.tenantId !== input.tenantId ||
      reservation.status !== INVENTORY_RESERVATION_STATUSES.ACTIVE
    ) {
      return null;
    }

    const consumedReservation: InventoryReservationRecord = {
      ...reservation,
      reservedQuantity: '0.000',
      status: INVENTORY_RESERVATION_STATUSES.CONSUMED,
      consumedAt: input.consumedAt,
    };

    this.reservationsById.set(input.reservationId, consumedReservation);

    return consumedReservation;
  }

  getReservation(reservationId: string): InventoryReservationRecord | null {
    return this.reservationsById.get(reservationId) ?? null;
  }

  listReservations(): readonly InventoryReservationRecord[] {
    return Array.from(this.reservationsById.values());
  }
}

class StatefulFifoReservationAllocationStore
  extends FifoReservationAllocationStore
  implements SnapshotCapableStore
{
  private allocationsById = new Map<string, FifoReservationAllocationRecord>();

  constructor(allocations: readonly FifoReservationAllocationRecord[]) {
    super();

    this.allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  }

  snapshot(): readonly FifoReservationAllocationRecord[] {
    return this.listAllocations();
  }

  restore(snapshot: unknown): void {
    this.allocationsById = new Map(
      (snapshot as readonly FifoReservationAllocationRecord[]).map((allocation) => [
        allocation.id,
        allocation,
      ]),
    );
  }

  async createAllocations(
    inputs: readonly CreateFifoReservationAllocationInput[],
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    for (const input of inputs) {
      this.allocationsById.set(input.id, input);
    }

    return inputs;
  }

  async releaseActiveAllocationsByReservation(
    input: ReleaseFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    const releasedAllocations = this.listAllocations()
      .filter(
        (allocation) =>
          allocation.tenantId === input.tenantId &&
          allocation.reservationId === input.reservationId &&
          allocation.status === FIFO_ALLOCATION_STATUSES.ACTIVE,
      )
      .map((allocation) => ({
        ...allocation,
        status: FIFO_ALLOCATION_STATUSES.RELEASED,
        releasedAt: input.releasedAt,
      }));

    for (const allocation of releasedAllocations) {
      this.allocationsById.set(allocation.id, allocation);
    }

    return releasedAllocations;
  }

  async lockActiveAllocationsByReservationForUpdate(
    input: LockFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    return this.listAllocations().filter(
      (allocation) =>
        allocation.tenantId === input.tenantId &&
        allocation.reservationId === input.reservationId &&
        allocation.status === FIFO_ALLOCATION_STATUSES.ACTIVE,
    );
  }

  async markActiveAllocationsConsumedByReservation(
    input: ConsumeFifoReservationAllocationsInput,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    const allocationIds = new Set(input.allocationIds);
    const consumedAllocations = this.listAllocations()
      .filter(
        (allocation) =>
          allocation.tenantId === input.tenantId &&
          allocation.reservationId === input.reservationId &&
          allocationIds.has(allocation.id) &&
          allocation.status === FIFO_ALLOCATION_STATUSES.ACTIVE,
      )
      .map((allocation) => ({
        ...allocation,
        status: FIFO_ALLOCATION_STATUSES.CONSUMED,
        consumedAt: input.consumedAt,
      }));

    for (const allocation of consumedAllocations) {
      this.allocationsById.set(allocation.id, allocation);
    }

    return consumedAllocations;
  }

  getActiveReservedQuantityByLayer(): ReadonlyMap<string, bigint> {
    const totalsByLayer = new Map<string, bigint>();

    for (const allocation of this.listAllocations()) {
      if (allocation.status !== FIFO_ALLOCATION_STATUSES.ACTIVE) {
        continue;
      }

      totalsByLayer.set(
        allocation.fifoLayerId,
        (totalsByLayer.get(allocation.fifoLayerId) ?? 0n) +
          parseQuantityUnits(allocation.reservedQuantity),
      );
    }

    return totalsByLayer;
  }

  listAllocations(): readonly FifoReservationAllocationRecord[] {
    return Array.from(this.allocationsById.values());
  }
}

class StatefulFifoConsumptionStore extends FifoConsumptionStore implements SnapshotCapableStore {
  createConsumptionInputs: CreateFifoConsumptionInput[] = [];

  snapshot(): readonly CreateFifoConsumptionInput[] {
    return [...this.createConsumptionInputs];
  }

  restore(snapshot: unknown): void {
    this.createConsumptionInputs = [...(snapshot as readonly CreateFifoConsumptionInput[])];
  }

  async createConsumptions(
    inputs: readonly CreateFifoConsumptionInput[],
  ): Promise<readonly FifoConsumptionRecord[]> {
    this.createConsumptionInputs.push(...inputs);

    return inputs;
  }
}

class StatefulInventoryLedgerStore extends InventoryLedgerStore implements SnapshotCapableStore {
  createLedgerEntryInputs: CreateInventoryLedgerEntryInput[] = [];

  snapshot(): readonly CreateInventoryLedgerEntryInput[] {
    return [...this.createLedgerEntryInputs];
  }

  restore(snapshot: unknown): void {
    this.createLedgerEntryInputs = [...(snapshot as readonly CreateInventoryLedgerEntryInput[])];
  }

  async createLedgerEntry(
    input: CreateInventoryLedgerEntryInput,
  ): Promise<InventoryLedgerEntryRecord> {
    this.createLedgerEntryInputs.push(input);

    return input;
  }
}

function createLayerStateMap(
  layers: readonly FifoLayerAllocationCandidateRecord[],
): Map<string, MutableFifoLayerState> {
  return new Map(
    layers.map((layer) => [
      layer.id,
      {
        base: layer,
        remainingUnits: parseQuantityUnits(layer.remainingQuantity),
        preExistingActiveReservedUnits: parseQuantityUnits(layer.activeReservedQuantity),
      },
    ]),
  );
}

function compareLayerStateByFifoOrder(
  left: MutableFifoLayerState,
  right: MutableFifoLayerState,
): number {
  const receivedAtDelta = left.base.receivedAt.getTime() - right.base.receivedAt.getTime();

  return receivedAtDelta === 0 ? left.base.id.localeCompare(right.base.id) : receivedAtDelta;
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(fractionalPart.padEnd(3, '0'));
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const fractionalPart = value % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
}

function getFulfilledResults<Result>(
  results: readonly PromiseSettledResult<Result>[],
): readonly PromiseFulfilledResult<Result>[] {
  return results.filter(
    (result): result is PromiseFulfilledResult<Result> => result.status === 'fulfilled',
  );
}

function getRejectedResults<Result>(
  results: readonly PromiseSettledResult<Result>[],
): readonly PromiseRejectedResult[] {
  return results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
}

function isPresent<Value>(value: Value | null): value is Value {
  return value !== null;
}
