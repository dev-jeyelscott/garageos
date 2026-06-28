import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES,
  FifoLayerStore,
  type DecrementFifoLayerRemainingQuantityInput,
  type FifoLayerAllocationCandidateRecord,
  type FifoLayerRecord,
  type FifoLayerSourceTransactionType,
} from './fifo-layer.store';

const MAX_MONEY = 999_999_999_999.99;
const MAX_QUANTITY = 999_999_999_999.999;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const NON_NEGATIVE_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export interface CreateFifoLayerCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly quantityReceived: string;
  readonly unitCost: string;
  readonly sourceTransactionType: FifoLayerSourceTransactionType | string;
  readonly sourceTransactionId: string;
  readonly receivedAt?: Date;
  readonly originalSourceLayerId?: string | null;
}

export interface LockOpenFifoLayersForAllocationCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
}

export interface DecrementFifoLayerRemainingQuantityCommand {
  readonly tenantId: string;
  readonly fifoLayerId: string;
  readonly quantityConsumed: string;
}

@Injectable()
export class FifoLayerService {
  constructor(
    @Inject(FifoLayerStore)
    private readonly fifoLayerStore: FifoLayerStore,
  ) {}

  async createLayer(
    command: CreateFifoLayerCommand,
    client?: DatabaseQueryClient,
  ): Promise<FifoLayerRecord> {
    const input = normalizeCreateFifoLayerCommand(command);

    return this.fifoLayerStore.createLayer(
      {
        id: randomUUID(),
        ...input,
      },
      client,
    );
  }

  async lockOpenLayersForAllocation(
    command: LockOpenFifoLayersForAllocationCommand,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    const input = normalizeLockOpenFifoLayersCommand(command);

    return this.fifoLayerStore.lockOpenLayersForAllocation(input, client);
  }

  async decrementRemainingQuantity(
    command: DecrementFifoLayerRemainingQuantityCommand,
    client?: DatabaseQueryClient,
  ): Promise<FifoLayerRecord | null> {
    const input = normalizeDecrementFifoLayerRemainingQuantityCommand(command);

    return this.fifoLayerStore.decrementRemainingQuantity(input, client);
  }
}

function normalizeCreateFifoLayerCommand(
  command: CreateFifoLayerCommand,
): Omit<FifoLayerRecord, 'id'> {
  const quantityReceived = normalizePositiveQuantity(command.quantityReceived, 'quantity_received');

  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeUuid(command.branchId, 'branch_id'),
    productId: normalizeUuid(command.productId, 'product_id'),
    quantityReceived,
    remainingQuantity: quantityReceived,
    unitCost: normalizeNonNegativeMoney(command.unitCost, 'unit_cost'),
    sourceTransactionType: normalizeSourceTransactionType(command.sourceTransactionType),
    sourceTransactionId: normalizeUuid(command.sourceTransactionId, 'source_transaction_id'),
    receivedAt: normalizeDate(command.receivedAt, 'received_at'),
    originalSourceLayerId: normalizeNullableUuid(
      command.originalSourceLayerId,
      'original_source_layer_id',
    ),
  };
}

function normalizeLockOpenFifoLayersCommand(
  command: LockOpenFifoLayersForAllocationCommand,
): LockOpenFifoLayersForAllocationCommand {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeUuid(command.branchId, 'branch_id'),
    productId: normalizeUuid(command.productId, 'product_id'),
  };
}

function normalizeDecrementFifoLayerRemainingQuantityCommand(
  command: DecrementFifoLayerRemainingQuantityCommand,
): DecrementFifoLayerRemainingQuantityInput {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    fifoLayerId: normalizeUuid(command.fifoLayerId, 'fifo_layer_id'),
    quantityConsumed: normalizePositiveQuantity(command.quantityConsumed, 'quantity_consumed'),
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

function normalizeNullableUuid(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeUuid(value, field);
}

function normalizeSourceTransactionType(
  value: FifoLayerSourceTransactionType | string,
): FifoLayerSourceTransactionType {
  const normalizedValue = normalizeRequiredText(value, 'source_transaction_type').toLowerCase();

  if ((FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as FifoLayerSourceTransactionType;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'source_transaction_type',
      code: 'unsupported_fifo_layer_source_transaction_type',
      message: 'FIFO layer source transaction type is not supported.',
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

function normalizeNonNegativeMoney(value: string, field: string): string {
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
