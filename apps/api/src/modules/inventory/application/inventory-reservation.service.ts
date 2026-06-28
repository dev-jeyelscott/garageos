import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
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

export type InventoryReservationTransactionType = (typeof RESERVATION_TRANSACTION_TYPES)[number];

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
  readonly stockAvailability: StockAvailabilitySnapshot;
  readonly ledgerEntry: InventoryLedgerEntryRecord;
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

@Injectable()
export class InventoryReservationService {
  constructor(
    @Inject(InventoryReservationStore)
    private readonly inventoryReservationStore: InventoryReservationStore,
    private readonly inventoryStockBalancesService: InventoryStockBalancesService,
    @Inject(StockBalanceStore)
    private readonly stockBalanceStore: StockBalanceStore,
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

    const reservation = await this.inventoryReservationStore.createReservation(
      {
        id: randomUUID(),
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
      stockAvailability: toStockAvailabilitySnapshot(updatedStockAvailability),
      ledgerEntry,
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
