import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  INVENTORY_TRANSACTION_TYPE_VALUES,
  InventoryLedgerStore,
  type InventoryLedgerEntryRecord,
  type InventoryTransactionType,
} from './inventory-ledger.store';

const MAX_MONEY = 999_999_999_999.99;
const MAX_QUANTITY = 999_999_999_999.999;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const SIGNED_QUANTITY_PATTERN = /^-?\d+(\.\d{1,3})?$/;
const NON_NEGATIVE_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export interface RecordInventoryLedgerEntryCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly transactionType: InventoryTransactionType | string;
  readonly quantityDeltaOnHand: string;
  readonly quantityDeltaReserved: string;
  readonly unitCost?: string | null;
  readonly totalCost?: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly occurredAt?: Date;
  readonly createdByUserId?: string | null;
}

@Injectable()
export class InventoryLedgerService {
  constructor(
    @Inject(InventoryLedgerStore)
    private readonly inventoryLedgerStore: InventoryLedgerStore,
  ) {}

  async recordLedgerEntry(
    command: RecordInventoryLedgerEntryCommand,
    client?: DatabaseQueryClient,
  ): Promise<InventoryLedgerEntryRecord> {
    const input = normalizeRecordLedgerEntryCommand(command);

    return this.inventoryLedgerStore.createLedgerEntry(
      {
        id: randomUUID(),
        ...input,
      },
      client,
    );
  }
}

function normalizeRecordLedgerEntryCommand(
  command: RecordInventoryLedgerEntryCommand,
): Omit<InventoryLedgerEntryRecord, 'id'> {
  const quantityDeltaOnHand = normalizeSignedQuantity(
    command.quantityDeltaOnHand,
    'quantity_delta_on_hand',
  );
  const quantityDeltaReserved = normalizeSignedQuantity(
    command.quantityDeltaReserved,
    'quantity_delta_reserved',
  );

  if (isDecimalZero(quantityDeltaOnHand) && isDecimalZero(quantityDeltaReserved)) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'quantity_delta_on_hand',
        code: 'inventory_ledger_delta_required',
        message: 'At least one inventory ledger quantity delta is required.',
      },
      {
        field: 'quantity_delta_reserved',
        code: 'inventory_ledger_delta_required',
        message: 'At least one inventory ledger quantity delta is required.',
      },
    ]);
  }

  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeUuid(command.branchId, 'branch_id'),
    productId: normalizeUuid(command.productId, 'product_id'),
    transactionType: normalizeTransactionType(command.transactionType),
    quantityDeltaOnHand,
    quantityDeltaReserved,
    unitCost: normalizeNullableMoney(command.unitCost, 'unit_cost'),
    totalCost: normalizeNullableMoney(command.totalCost, 'total_cost'),
    sourceType: normalizeSourceType(command.sourceType),
    sourceId: normalizeUuid(command.sourceId, 'source_id'),
    occurredAt: command.occurredAt ?? new Date(),
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

function normalizeTransactionType(
  value: InventoryTransactionType | string,
): InventoryTransactionType {
  const normalizedValue = normalizeRequiredText(value, 'transaction_type');

  if ((INVENTORY_TRANSACTION_TYPE_VALUES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as InventoryTransactionType;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'transaction_type',
      code: 'unsupported_inventory_transaction_type',
      message: 'Inventory transaction type is not supported.',
    },
  ]);
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

function normalizeSignedQuantity(value: string, field: string): string {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!SIGNED_QUANTITY_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_quantity_delta',
        message: 'Quantity delta must be a signed decimal with up to 3 decimals.',
      },
    ]);
  }

  const decimal = normalizeDecimalString(normalizedValue, 3);

  if (Math.abs(Number(decimal)) > MAX_QUANTITY) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'quantity_delta_too_large',
        message: 'Quantity delta is too large.',
      },
    ]);
  }

  return decimal;
}

function normalizeNullableMoney(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = normalizeRequiredText(value, field);

  if (!NON_NEGATIVE_MONEY_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_money_amount',
        message: 'Amount must be a non-negative decimal with up to 2 decimals.',
      },
    ]);
  }

  const decimal = normalizeDecimalString(normalizedValue, 2);

  if (Number(decimal) > MAX_MONEY) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'money_amount_too_large',
        message: 'Amount is too large.',
      },
    ]);
  }

  return decimal;
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
  const isNegative = value.startsWith('-');
  const unsignedValue = isNegative ? value.slice(1) : value;
  const [wholePart = '0', decimalPart = ''] = unsignedValue.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(scale, '0');
  const normalizedUnsignedValue = `${normalizedWholePart}.${normalizedDecimalPart}`;

  if (isDecimalZero(normalizedUnsignedValue)) {
    return `0.${''.padEnd(scale, '0')}`;
  }

  return isNegative ? `-${normalizedUnsignedValue}` : normalizedUnsignedValue;
}

function isDecimalZero(value: string): boolean {
  return value
    .replace('-', '')
    .replace('.', '')
    .split('')
    .every((character) => character === '0');
}
