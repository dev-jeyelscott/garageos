import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { FifoLayerService } from './fifo-layer.service';
import { FifoConsumptionStore, type FifoConsumptionRecord } from './fifo-consumption.store';
import type { FifoLayerAllocationCandidateRecord } from './fifo-layer.store';
import {
  FIFO_ALLOCATION_STATUSES,
  FifoReservationAllocationStore,
  type CreateFifoReservationAllocationInput,
  type FifoReservationAllocationRecord,
} from './fifo-reservation-allocation.store';
import {
  calculateAvailableQuantity,
  InventoryStockBalancesService,
  type StockAvailabilitySnapshot,
} from './inventory-stock-balances.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  INVENTORY_TRANSACTION_TYPES,
  type InventoryLedgerEntryRecord,
  type InventoryTransactionType,
} from './inventory-ledger.store';
import {
  INVENTORY_RESERVATION_STATUSES,
  InventoryReservationStore,
  type InventoryReservationRecord,
} from './inventory-reservation.store';
import { StockBalanceStore, type StockAvailabilityRecord } from './stock-balance.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const POSITIVE_QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const MAX_QUANTITY = 999_999_999_999.999;

const RESERVATION_TRANSACTION_TYPES = [
  INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
  INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION,
] as const;

const RESERVATION_RELEASE_TRANSACTION_TYPES = [
  INVENTORY_TRANSACTION_TYPES.RESERVATION_RELEASE,
  INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
] as const;

const RESERVATION_CONSUMPTION_TRANSACTION_TYPES = [
  INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
] as const;

export type InventoryReservationTransactionType = (typeof RESERVATION_TRANSACTION_TYPES)[number];

export type InventoryReservationReleaseTransactionType =
  (typeof RESERVATION_RELEASE_TRANSACTION_TYPES)[number];

export type InventoryReservationConsumptionTransactionType =
  (typeof RESERVATION_CONSUMPTION_TRANSACTION_TYPES)[number];

export interface ReserveInventoryCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly requestedQuantity: string;
  readonly transactionType: InventoryReservationTransactionType | string;
  readonly reservedAt?: Date;
  readonly createdByUserId?: string | null;
}

export interface InventoryReservationCommandResult {
  readonly reservation: InventoryReservationRecord;
  readonly fifoAllocations: readonly FifoReservationAllocationRecord[];
  readonly stockAvailability: StockAvailabilitySnapshot;
  readonly ledgerEntry: InventoryLedgerEntryRecord;
}

export interface ReleaseInventoryReservationCommand {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly releaseQuantity?: string;
  readonly transactionType: InventoryReservationReleaseTransactionType | string;
  readonly releasedAt?: Date;
  readonly releasedByUserId?: string | null;
}

export interface InventoryReservationReleaseCommandResult {
  readonly reservation: InventoryReservationRecord;
  readonly fifoAllocations: readonly FifoReservationAllocationRecord[];
  readonly stockAvailability: StockAvailabilitySnapshot;
  readonly ledgerEntry: InventoryLedgerEntryRecord;
}

export interface ConsumeInventoryReservationCommand {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly transactionType: InventoryReservationConsumptionTransactionType | string;
  readonly consumedAt?: Date;
  readonly consumedByUserId?: string | null;
}

export interface InventoryReservationConsumptionCommandResult {
  readonly reservation: InventoryReservationRecord;
  readonly fifoAllocations: readonly FifoReservationAllocationRecord[];
  readonly fifoConsumptions: readonly FifoConsumptionRecord[];
  readonly stockAvailability: StockAvailabilitySnapshot;
  readonly ledgerEntry: InventoryLedgerEntryRecord;
  readonly totalCost: string;
}

interface NormalizedReserveInventoryCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly requestedQuantity: string;
  readonly transactionType: InventoryReservationTransactionType;
  readonly reservedAt: Date;
  readonly createdByUserId: string | null;
}

interface NormalizedReleaseInventoryReservationCommand {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly releaseQuantity: string | null;
  readonly transactionType: InventoryReservationReleaseTransactionType;
  readonly releasedAt: Date;
  readonly releasedByUserId: string | null;
}

interface NormalizedConsumeInventoryReservationCommand {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly transactionType: InventoryReservationConsumptionTransactionType;
  readonly consumedAt: Date;
  readonly consumedByUserId: string | null;
}

interface BuildFifoReservationAllocationsInput {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly requestedQuantity: string;
  readonly allocatedAt: Date;
  readonly candidates: readonly FifoLayerAllocationCandidateRecord[];
}

@Injectable()
export class InventoryReservationService {
  constructor(
    @Inject(InventoryReservationStore)
    private readonly inventoryReservationStore: InventoryReservationStore,
    @Inject(InventoryStockBalancesService)
    private readonly inventoryStockBalancesService: InventoryStockBalancesService,
    @Inject(FifoLayerService)
    private readonly fifoLayerService: FifoLayerService,
    @Inject(FifoReservationAllocationStore)
    private readonly fifoReservationAllocationStore: FifoReservationAllocationStore,
    @Inject(FifoConsumptionStore)
    private readonly fifoConsumptionStore: FifoConsumptionStore,
    @Inject(StockBalanceStore)
    private readonly stockBalanceStore: StockBalanceStore,
    @Inject(InventoryLedgerService)
    private readonly inventoryLedgerService: InventoryLedgerService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  async reserveInventory(
    command: ReserveInventoryCommand,
  ): Promise<InventoryReservationCommandResult> {
    const input = normalizeReserveInventoryCommand(command);

    return this.transactionRunner.runInTransaction((transaction) =>
      this.executeReservation(input, transaction),
    );
  }

  async reserveInventoryInTransaction(
    command: ReserveInventoryCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationCommandResult> {
    const input = normalizeReserveInventoryCommand(command);

    return this.executeReservation(input, client);
  }

  async releaseInventory(
    command: ReleaseInventoryReservationCommand,
  ): Promise<InventoryReservationReleaseCommandResult> {
    const input = normalizeReleaseInventoryCommand(command);

    return this.transactionRunner.runInTransaction((transaction) =>
      this.executeRelease(input, transaction),
    );
  }

  async releaseInventoryInTransaction(
    command: ReleaseInventoryReservationCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationReleaseCommandResult> {
    const input = normalizeReleaseInventoryCommand(command);

    return this.executeRelease(input, client);
  }

  async assertActiveReservationInTransaction(
    command: {
      readonly tenantId: string;
      readonly reservationId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationRecord> {
    const reservation = await this.inventoryReservationStore.lockActiveReservationForUpdate(
      {
        tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
        reservationId: normalizeUuid(command.reservationId, 'reservation_id'),
      },
      client,
    );

    if (reservation === null) {
      throw GarageOsApiException.workflowTransitionBlocked('Inventory reservation is not active.', [
        {
          field: 'reservation_id',
          code: 'reservation_not_active',
          message: 'Reservation is not active or does not exist.',
        },
      ]);
    }

    return reservation;
  }

  async consumeInventory(
    command: ConsumeInventoryReservationCommand,
  ): Promise<InventoryReservationConsumptionCommandResult> {
    const input = normalizeConsumeInventoryCommand(command);

    return this.transactionRunner.runInTransaction((transaction) =>
      this.executeConsumption(input, transaction),
    );
  }

  async consumeInventoryInTransaction(
    command: ConsumeInventoryReservationCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationConsumptionCommandResult> {
    const input = normalizeConsumeInventoryCommand(command);

    return this.executeConsumption(input, client);
  }

  private async executeReservation(
    input: NormalizedReserveInventoryCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationCommandResult> {
    await this.inventoryStockBalancesService.assertSufficientAvailableStock(
      {
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        requestedQuantity: input.requestedQuantity,
      },
      client,
    );

    const fifoLayerCandidates = await this.fifoLayerService.lockOpenLayersForAllocation(
      {
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
      },
      client,
    );

    const reservationId = randomUUID();
    const fifoAllocationInputs = buildFifoReservationAllocations({
      tenantId: input.tenantId,
      reservationId,
      requestedQuantity: input.requestedQuantity,
      allocatedAt: input.reservedAt,
      candidates: fifoLayerCandidates,
    });

    const reservation = await this.inventoryReservationStore.createReservation(
      {
        id: reservationId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        requestedQuantity: input.requestedQuantity,
        reservedQuantity: input.requestedQuantity,
        status: INVENTORY_RESERVATION_STATUSES.ACTIVE,
        reservedAt: input.reservedAt,
        releasedAt: null,
        consumedAt: null,
      },
      client,
    );

    const fifoAllocations = await this.fifoReservationAllocationStore.createAllocations(
      fifoAllocationInputs,
      client,
    );

    const updatedStockAvailability = await this.stockBalanceStore.incrementReservedQuantity(
      {
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        reservedQuantityDelta: input.requestedQuantity,
      },
      client,
    );

    if (updatedStockAvailability === null) {
      throw GarageOsApiException.inventoryInsufficientAvailableStock([
        {
          field: 'requested_qty',
          code: 'insufficient_available_stock',
          message: 'Requested quantity exceeds available stock.',
        },
      ]);
    }

    const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
      {
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        transactionType: input.transactionType,
        quantityDeltaOnHand: '0.000',
        quantityDeltaReserved: input.requestedQuantity,
        unitCost: null,
        totalCost: null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        occurredAt: input.reservedAt,
        createdByUserId: input.createdByUserId,
      },
      client,
    );

    return {
      reservation,
      fifoAllocations,
      stockAvailability: toStockAvailabilitySnapshot(updatedStockAvailability),
      ledgerEntry,
    };
  }
  private async executeRelease(
    input: NormalizedReleaseInventoryReservationCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationReleaseCommandResult> {
    const activeReservation = await this.inventoryReservationStore.lockActiveReservationForUpdate(
      {
        tenantId: input.tenantId,
        reservationId: input.reservationId,
      },
      client,
    );

    if (activeReservation === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation cannot be released.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_not_active',
            message: 'Reservation is not active or does not exist.',
          },
        ],
      );
    }

    const activeReservedQuantity = normalizePositiveQuantity(
      activeReservation.reservedQuantity,
      'reserved_qty',
    );
    const releasedQuantity =
      input.releaseQuantity === null
        ? activeReservedQuantity
        : normalizePositiveQuantity(input.releaseQuantity, 'release_quantity');

    if (compareQuantities(releasedQuantity, activeReservedQuantity) > 0) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation release exceeds the active reserved quantity.',
        [
          {
            field: 'release_quantity',
            code: 'reservation_release_exceeds_reserved',
            message: 'Release quantity cannot exceed reserved quantity.',
          },
        ],
      );
    }

    const updatedStockAvailability = await this.stockBalanceStore.decrementReservedQuantity(
      {
        tenantId: activeReservation.tenantId,
        branchId: activeReservation.branchId,
        productId: activeReservation.productId,
        reservedQuantityDelta: releasedQuantity,
      },
      client,
    );

    if (updatedStockAvailability === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation release would make reserved stock negative.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_release_conflict',
            message: 'Reservation release conflicts with the current stock balance.',
          },
        ],
      );
    }

    const isFullRelease = compareQuantities(releasedQuantity, activeReservedQuantity) === 0;
    const fifoAllocations = isFullRelease
      ? await this.fifoReservationAllocationStore.releaseActiveAllocationsByReservation(
          {
            tenantId: activeReservation.tenantId,
            reservationId: activeReservation.id,
            releasedAt: input.releasedAt,
          },
          client,
        )
      : await this.releasePartialFifoAllocations(
          activeReservation.tenantId,
          activeReservation.id,
          releasedQuantity,
          input.releasedAt,
          client,
        );

    const releasedReservation = isFullRelease
      ? await this.inventoryReservationStore.markReservationReleased(
          {
            tenantId: activeReservation.tenantId,
            reservationId: activeReservation.id,
            releasedAt: input.releasedAt,
          },
          client,
        )
      : await this.inventoryReservationStore.decrementActiveReservationQuantity(
          {
            tenantId: activeReservation.tenantId,
            reservationId: activeReservation.id,
            releaseQuantity: releasedQuantity,
          },
          client,
        );

    if (releasedReservation === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation cannot be released.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_release_conflict',
            message: 'Reservation status changed before release completed.',
          },
        ],
      );
    }

    const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
      {
        tenantId: activeReservation.tenantId,
        branchId: activeReservation.branchId,
        productId: activeReservation.productId,
        transactionType: input.transactionType,
        quantityDeltaOnHand: '0.000',
        quantityDeltaReserved: negateQuantity(releasedQuantity),
        unitCost: null,
        totalCost: null,
        sourceType: activeReservation.sourceType,
        sourceId: activeReservation.sourceId,
        occurredAt: input.releasedAt,
        createdByUserId: input.releasedByUserId,
      },
      client,
    );

    return {
      reservation: releasedReservation,
      fifoAllocations,
      stockAvailability: toStockAvailabilitySnapshot(updatedStockAvailability),
      ledgerEntry,
    };
  }

  private async releasePartialFifoAllocations(
    tenantId: string,
    reservationId: string,
    releaseQuantity: string,
    releasedAt: Date,
    client: DatabaseQueryClient,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    const activeAllocations =
      await this.fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdate(
        {
          tenantId,
          reservationId,
        },
        client,
      );

    let remainingReleaseUnits = parseQuantityUnits(releaseQuantity, 'release_quantity');
    const releasedAllocations: FifoReservationAllocationRecord[] = [];

    for (const allocation of [...activeAllocations].reverse()) {
      if (remainingReleaseUnits === 0n) {
        break;
      }

      const allocationUnits = parseQuantityUnits(allocation.reservedQuantity, 'reserved_qty');

      if (allocationUnits <= remainingReleaseUnits) {
        const releasedAllocation =
          await this.fifoReservationAllocationStore.releaseActiveAllocation(
            {
              tenantId,
              allocationId: allocation.id,
              releasedAt,
            },
            client,
          );

        if (releasedAllocation === null) {
          throw GarageOsApiException.fifoAllocationConflict([
            {
              field: 'reservation_id',
              code: 'fifo_allocation_release_conflict',
              message: 'FIFO allocation status changed before release completed.',
            },
          ]);
        }

        releasedAllocations.push(releasedAllocation);
        remainingReleaseUnits -= allocationUnits;
        continue;
      }

      const remainingAllocationQuantity = formatQuantityUnits(
        allocationUnits - remainingReleaseUnits,
      );
      const updatedAllocation =
        await this.fifoReservationAllocationStore.updateActiveAllocationQuantity(
          {
            tenantId,
            allocationId: allocation.id,
            reservedQuantity: remainingAllocationQuantity,
          },
          client,
        );

      if (updatedAllocation === null) {
        throw GarageOsApiException.fifoAllocationConflict([
          {
            field: 'reservation_id',
            code: 'fifo_allocation_release_conflict',
            message: 'FIFO allocation quantity could not be reduced.',
          },
        ]);
      }

      releasedAllocations.push({
        ...allocation,
        reservedQuantity: formatQuantityUnits(remainingReleaseUnits),
        status: FIFO_ALLOCATION_STATUSES.RELEASED,
        releasedAt,
      });
      remainingReleaseUnits = 0n;
    }

    if (remainingReleaseUnits > 0n) {
      throw GarageOsApiException.fifoAllocationConflict([
        {
          field: 'release_quantity',
          code: 'insufficient_fifo_allocation_quantity',
          message: 'Release quantity exceeds active FIFO allocation quantity.',
        },
      ]);
    }

    return releasedAllocations;
  }

  private async executeConsumption(
    input: NormalizedConsumeInventoryReservationCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReservationConsumptionCommandResult> {
    const activeReservation = await this.inventoryReservationStore.lockActiveReservationForUpdate(
      {
        tenantId: input.tenantId,
        reservationId: input.reservationId,
      },
      client,
    );

    if (activeReservation === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation cannot be consumed.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_not_active',
            message: 'Reservation is not active or does not exist.',
          },
        ],
      );
    }

    const reservedQuantity = normalizePositiveQuantity(
      activeReservation.reservedQuantity,
      'reserved_qty',
    );

    const activeAllocations =
      await this.fifoReservationAllocationStore.lockActiveAllocationsByReservationForUpdate(
        {
          tenantId: activeReservation.tenantId,
          reservationId: activeReservation.id,
        },
        client,
      );

    const allocatedQuantityUnits = activeAllocations.reduce(
      (total, allocation) =>
        total + parseQuantityUnits(allocation.reservedQuantity, 'reserved_qty'),
      0n,
    );
    const reservedQuantityUnits = parseQuantityUnits(reservedQuantity, 'reserved_qty');

    if (allocatedQuantityUnits !== reservedQuantityUnits) {
      throw GarageOsApiException.fifoAllocationConflict([
        {
          field: 'reservation_id',
          code: 'fifo_allocation_quantity_mismatch',
          message: 'Active FIFO allocation quantity does not match reserved quantity.',
        },
      ]);
    }

    const updatedStockAvailability =
      await this.stockBalanceStore.decrementOnHandAndReservedQuantity(
        {
          tenantId: activeReservation.tenantId,
          branchId: activeReservation.branchId,
          productId: activeReservation.productId,
          quantityConsumed: reservedQuantity,
        },
        client,
      );

    if (updatedStockAvailability === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation consumption conflicts with the current stock balance.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_consumption_stock_conflict',
            message: 'Reservation consumption would make stock quantities invalid.',
          },
        ],
      );
    }

    const fifoConsumptionInputs = activeAllocations.map((allocation) => {
      const totalCost = calculateTotalCost(
        allocation.reservedQuantity,
        allocation.unitCostSnapshot,
      );

      return {
        id: randomUUID(),
        tenantId: activeReservation.tenantId,
        branchId: activeReservation.branchId,
        productId: activeReservation.productId,
        fifoLayerId: allocation.fifoLayerId,
        quantityConsumed: allocation.reservedQuantity,
        unitCost: allocation.unitCostSnapshot,
        totalCost,
        sourceType: activeReservation.sourceType,
        sourceId: activeReservation.sourceId,
        consumedAt: input.consumedAt,
      };
    });

    for (const allocation of activeAllocations) {
      const decrementedLayer = await this.fifoLayerService.decrementRemainingQuantity(
        {
          tenantId: activeReservation.tenantId,
          fifoLayerId: allocation.fifoLayerId,
          quantityConsumed: allocation.reservedQuantity,
        },
        client,
      );

      if (decrementedLayer === null) {
        throw GarageOsApiException.fifoAllocationConflict([
          {
            field: 'reservation_id',
            code: 'fifo_layer_consumption_conflict',
            message: 'FIFO layer quantity could not be decremented for consumption.',
          },
        ]);
      }
    }

    const fifoConsumptions = await this.fifoConsumptionStore.createConsumptions(
      fifoConsumptionInputs,
      client,
    );

    const consumedAllocations =
      await this.fifoReservationAllocationStore.markActiveAllocationsConsumedByReservation(
        {
          tenantId: activeReservation.tenantId,
          reservationId: activeReservation.id,
          allocationIds: activeAllocations.map((allocation) => allocation.id),
          consumedAt: input.consumedAt,
        },
        client,
      );

    const consumedReservation = await this.inventoryReservationStore.markReservationConsumed(
      {
        tenantId: activeReservation.tenantId,
        reservationId: activeReservation.id,
        consumedAt: input.consumedAt,
      },
      client,
    );

    if (consumedReservation === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Inventory reservation cannot be consumed.',
        [
          {
            field: 'reservation_id',
            code: 'reservation_consumption_conflict',
            message: 'Reservation status changed before consumption completed.',
          },
        ],
      );
    }

    const totalCost = sumMoneyAmounts(
      fifoConsumptionInputs.map((consumption) => consumption.totalCost),
    );

    const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
      {
        tenantId: activeReservation.tenantId,
        branchId: activeReservation.branchId,
        productId: activeReservation.productId,
        transactionType: input.transactionType,
        quantityDeltaOnHand: negateQuantity(reservedQuantity),
        quantityDeltaReserved: negateQuantity(reservedQuantity),
        unitCost: null,
        totalCost,
        sourceType: activeReservation.sourceType,
        sourceId: activeReservation.sourceId,
        occurredAt: input.consumedAt,
        createdByUserId: input.consumedByUserId,
      },
      client,
    );

    return {
      reservation: consumedReservation,
      fifoAllocations: consumedAllocations,
      fifoConsumptions,
      stockAvailability: toStockAvailabilitySnapshot(updatedStockAvailability),
      ledgerEntry,
      totalCost,
    };
  }
}

function normalizeReserveInventoryCommand(
  command: ReserveInventoryCommand,
): NormalizedReserveInventoryCommand {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeUuid(command.branchId, 'branch_id'),
    productId: normalizeUuid(command.productId, 'product_id'),
    sourceType: normalizeSourceType(command.sourceType),
    sourceId: normalizeUuid(command.sourceId, 'source_id'),
    requestedQuantity: normalizePositiveQuantity(command.requestedQuantity, 'requested_qty'),
    transactionType: normalizeReservationTransactionType(command.transactionType),
    reservedAt: normalizeDate(command.reservedAt, 'reserved_at'),
    createdByUserId:
      command.createdByUserId === null || command.createdByUserId === undefined
        ? null
        : normalizeUuid(command.createdByUserId, 'created_by_user_id'),
  };
}

function normalizeReleaseInventoryCommand(
  command: ReleaseInventoryReservationCommand,
): NormalizedReleaseInventoryReservationCommand {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    reservationId: normalizeUuid(command.reservationId, 'reservation_id'),
    releaseQuantity:
      command.releaseQuantity === undefined || command.releaseQuantity === null
        ? null
        : normalizePositiveQuantity(command.releaseQuantity, 'release_quantity'),
    transactionType: normalizeReservationReleaseTransactionType(command.transactionType),
    releasedAt: normalizeDate(command.releasedAt, 'released_at'),
    releasedByUserId:
      command.releasedByUserId === null || command.releasedByUserId === undefined
        ? null
        : normalizeUuid(command.releasedByUserId, 'released_by_user_id'),
  };
}

function normalizeConsumeInventoryCommand(
  command: ConsumeInventoryReservationCommand,
): NormalizedConsumeInventoryReservationCommand {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    reservationId: normalizeUuid(command.reservationId, 'reservation_id'),
    transactionType: normalizeReservationConsumptionTransactionType(command.transactionType),
    consumedAt: normalizeDate(command.consumedAt, 'consumed_at'),
    consumedByUserId:
      command.consumedByUserId === null || command.consumedByUserId === undefined
        ? null
        : normalizeUuid(command.consumedByUserId, 'consumed_by_user_id'),
  };
}

function buildFifoReservationAllocations(
  input: BuildFifoReservationAllocationsInput,
): readonly CreateFifoReservationAllocationInput[] {
  let remainingQuantityUnits = parseQuantityUnits(input.requestedQuantity, 'requested_qty');
  const allocations: CreateFifoReservationAllocationInput[] = [];

  for (const candidate of input.candidates) {
    if (remainingQuantityUnits === 0n) {
      break;
    }

    const allocatableQuantityUnits = parseQuantityUnits(
      candidate.allocatableQuantity,
      'allocatable_quantity',
    );

    if (allocatableQuantityUnits <= 0n) {
      continue;
    }

    const reservedQuantityUnits =
      allocatableQuantityUnits < remainingQuantityUnits
        ? allocatableQuantityUnits
        : remainingQuantityUnits;

    allocations.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      reservationId: input.reservationId,
      fifoLayerId: candidate.id,
      reservedQuantity: formatQuantityUnits(reservedQuantityUnits),
      unitCostSnapshot: candidate.unitCost,
      status: FIFO_ALLOCATION_STATUSES.ACTIVE,
      allocatedAt: input.allocatedAt,
      releasedAt: null,
      consumedAt: null,
    });

    remainingQuantityUnits -= reservedQuantityUnits;
  }

  if (remainingQuantityUnits > 0n) {
    throw GarageOsApiException.fifoAllocationConflict([
      {
        field: 'requested_qty',
        code: 'insufficient_fifo_allocatable_quantity',
        message: 'Requested quantity exceeds FIFO allocatable quantity.',
      },
    ]);
  }

  return allocations;
}

function normalizeUuid(value: string, field: string): string {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_uuid',
        message: `${field} must be a valid UUID.`,
      },
    ]);
  }

  return normalizedValue;
}

function normalizeSourceType(value: string): string {
  const normalizedValue = normalizeRequiredText(value, 'source_type').toLowerCase();

  if (!SOURCE_TYPE_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'source_type',
        code: 'invalid_source_type',
        message: 'Source type must be a lowercase API-safe identifier.',
      },
    ]);
  }

  return normalizedValue;
}

function normalizeReservationTransactionType(
  value: InventoryTransactionType | string,
): InventoryReservationTransactionType {
  const normalizedValue = normalizeRequiredText(value, 'transaction_type');

  if ((RESERVATION_TRANSACTION_TYPES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as InventoryReservationTransactionType;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'transaction_type',
      code: 'unsupported_inventory_reservation_transaction_type',
      message: 'Inventory reservation transaction type is not supported.',
    },
  ]);
}

function normalizeReservationReleaseTransactionType(
  value: InventoryTransactionType | string,
): InventoryReservationReleaseTransactionType {
  const normalizedValue = normalizeRequiredText(value, 'transaction_type');

  if ((RESERVATION_RELEASE_TRANSACTION_TYPES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as InventoryReservationReleaseTransactionType;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'transaction_type',
      code: 'unsupported_inventory_reservation_release_transaction_type',
      message: 'Inventory reservation release transaction type is not supported.',
    },
  ]);
}

function normalizeReservationConsumptionTransactionType(
  value: InventoryTransactionType | string,
): InventoryReservationConsumptionTransactionType {
  const normalizedValue = normalizeRequiredText(value, 'transaction_type');

  if ((RESERVATION_CONSUMPTION_TRANSACTION_TYPES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as InventoryReservationConsumptionTransactionType;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'transaction_type',
      code: 'unsupported_inventory_reservation_consumption_transaction_type',
      message: 'Inventory reservation consumption transaction type is not supported.',
    },
  ]);
}

function normalizePositiveQuantity(value: string, field: string): string {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!POSITIVE_QUANTITY_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_quantity',
        message: 'Quantity must be a positive decimal with up to 3 decimals.',
      },
    ]);
  }

  const decimal = normalizeDecimalString(normalizedValue, 3);

  if (isDecimalZero(decimal)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'quantity_must_be_positive',
        message: 'Quantity must be greater than zero.',
      },
    ]);
  }

  if (Number(decimal) > MAX_QUANTITY) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'quantity_too_large',
        message: 'Quantity is too large.',
      },
    ]);
  }

  return decimal;
}

function normalizeDate(value: Date | undefined, field: string): Date {
  const date = value ?? new Date();

  if (Number.isNaN(date.getTime())) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_datetime',
        message: `${field} must be a valid date-time value.`,
      },
    ]);
  }

  return date;
}

function normalizeRequiredText(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: `${field} is required.`,
      },
    ]);
  }

  return normalizedValue;
}

function normalizeDecimalString(value: string, scale: number): string {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');

  return `${normalizedWholePart}.${normalizedDecimalPart}`;
}

function isDecimalZero(value: string): boolean {
  return value
    .replace('.', '')
    .split('')
    .every((character) => character === '0');
}

function parseQuantityUnits(value: string, field: string): bigint {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!POSITIVE_QUANTITY_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_quantity',
        message: 'Quantity must be a positive decimal with up to 3 decimals.',
      },
    ]);
  }

  const [wholePart = '0', decimalPart = ''] = normalizedValue.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(3, '0');

  return BigInt(normalizedWholePart) * 1000n + BigInt(normalizedDecimalPart);
}

function compareQuantities(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left, 'quantity');
  const rightUnits = parseQuantityUnits(right, 'quantity');

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function calculateTotalCost(quantity: string, unitCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity, 'quantity_consumed');
  const unitCostCents = parseMoneyCents(unitCost, 'unit_cost');

  const totalCents = (quantityUnits * unitCostCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function sumMoneyAmounts(amounts: readonly string[]): string {
  const totalCents = amounts.reduce(
    (total, amount) => total + parseMoneyCents(amount, 'total_cost'),
    0n,
  );

  return formatMoneyCents(totalCents);
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const decimalPart = value % 1000n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}

function negateQuantity(value: string): string {
  const quantityUnits = parseQuantityUnits(value, 'reserved_qty');

  return `-${formatQuantityUnits(quantityUnits)}`;
}

function toStockAvailabilitySnapshot(record: StockAvailabilityRecord): StockAvailabilitySnapshot {
  return {
    tenant_id: record.tenantId,
    branch_id: record.branchId,
    product_id: record.productId,
    on_hand_qty: record.onHandQty,
    reserved_qty: record.reservedQty,
    available_qty: calculateAvailableQuantity(record.onHandQty, record.reservedQty),
    lock_version: record.lockVersion,
  };
}

function parseMoneyCents(value: string, field: string): bigint {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_money_amount',
        message: 'Amount must be a non-negative decimal with up to 2 decimals.',
      },
    ]);
  }

  const [wholePart = '0', decimalPart = ''] = normalizedValue.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(2, '0');

  return BigInt(normalizedWholePart) * 100n + BigInt(normalizedDecimalPart);
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
