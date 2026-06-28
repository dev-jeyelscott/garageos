import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  FIFO_ALLOCATION_STATUS_VALUES,
  FifoReservationAllocationStore,
  type CreateFifoReservationAllocationInput,
  type FifoAllocationStatus,
  type FifoReservationAllocationRecord,
} from '../application/fifo-reservation-allocation.store';

interface FifoReservationAllocationRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly reservation_id: string;
  readonly fifo_layer_id: string;
  readonly reserved_quantity: string;
  readonly unit_cost_snapshot: string;
  readonly status: string;
  readonly allocated_at: Date | string;
  readonly released_at: Date | string | null;
  readonly consumed_at: Date | string | null;
}

@Injectable()
export class PostgresFifoReservationAllocationRepository extends FifoReservationAllocationStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createAllocations(
    inputs: readonly CreateFifoReservationAllocationInput[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly FifoReservationAllocationRecord[]> {
    const allocations: FifoReservationAllocationRecord[] = [];

    for (const input of inputs) {
      allocations.push(await this.createAllocation(input, client));
    }

    return allocations;
  }

  private async createAllocation(
    input: CreateFifoReservationAllocationInput,
    client: DatabaseQueryClient,
  ): Promise<FifoReservationAllocationRecord> {
    const result = await client.query<FifoReservationAllocationRow>(
      `
        insert into fifo_reservation_allocations (
          id,
          tenant_id,
          reservation_id,
          fifo_layer_id,
          reserved_quantity,
          unit_cost_snapshot,
          status,
          allocated_at,
          released_at,
          consumed_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::numeric(14,3),
          $6::numeric(14,2),
          $7,
          $8::timestamptz,
          $9::timestamptz,
          $10::timestamptz
        )
        returning
          id,
          tenant_id,
          reservation_id,
          fifo_layer_id,
          reserved_quantity::text,
          unit_cost_snapshot::text,
          status,
          allocated_at,
          released_at,
          consumed_at
      `,
      [
        input.id,
        input.tenantId,
        input.reservationId,
        input.fifoLayerId,
        input.reservedQuantity,
        input.unitCostSnapshot,
        input.status,
        input.allocatedAt,
        input.releasedAt,
        input.consumedAt,
      ],
    );

    return mapFifoReservationAllocationRow(
      getRequiredRow(result, 'create FIFO reservation allocation'),
    );
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`FIFO reservation allocation repository failed to ${operation}.`);
  }

  return row;
}

function mapFifoReservationAllocationRow(
  row: FifoReservationAllocationRow,
): FifoReservationAllocationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    reservationId: row.reservation_id,
    fifoLayerId: row.fifo_layer_id,
    reservedQuantity: row.reserved_quantity,
    unitCostSnapshot: row.unit_cost_snapshot,
    status: mapFifoAllocationStatus(row.status),
    allocatedAt: toDate(row.allocated_at),
    releasedAt: toNullableDate(row.released_at),
    consumedAt: toNullableDate(row.consumed_at),
  };
}

function mapFifoAllocationStatus(status: string): FifoAllocationStatus {
  if ((FIFO_ALLOCATION_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as FifoAllocationStatus;
  }

  throw new Error(`Unknown FIFO allocation status: ${status}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(value);
}
