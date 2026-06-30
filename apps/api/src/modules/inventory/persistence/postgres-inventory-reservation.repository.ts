import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  INVENTORY_RESERVATION_STATUSES,
  INVENTORY_RESERVATION_STATUS_VALUES,
  InventoryReservationStore,
  type ConsumeInventoryReservationInput,
  type CreateInventoryReservationInput,
  type InventoryReservationRecord,
  type InventoryReservationStatus,
  type LockInventoryReservationInput,
  type PartiallyReleaseInventoryReservationInput,
  type ReleaseInventoryReservationInput,
} from '../application/inventory-reservation.store';

interface InventoryReservationRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly requested_quantity: string;
  readonly reserved_quantity: string;
  readonly status: string;
  readonly reserved_at: Date | string;
  readonly released_at: Date | string | null;
  readonly consumed_at: Date | string | null;
}

@Injectable()
export class PostgresInventoryReservationRepository extends InventoryReservationStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createReservation(
    input: CreateInventoryReservationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryReservationRecord> {
    const result = await client.query<InventoryReservationRow>(
      `
        insert into inventory_reservations (
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity,
          reserved_quantity,
          status,
          reserved_at,
          released_at,
          consumed_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::uuid,
          $7::numeric(14,3),
          $8::numeric(14,3),
          $9,
          $10::timestamptz,
          $11::timestamptz,
          $12::timestamptz
        )
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity::text,
          reserved_quantity::text,
          status,
          reserved_at,
          released_at,
          consumed_at
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.productId,
        input.sourceType,
        input.sourceId,
        input.requestedQuantity,
        input.reservedQuantity,
        input.status,
        input.reservedAt,
        input.releasedAt,
        input.consumedAt,
      ],
    );

    return mapInventoryReservationRow(getRequiredRow(result, 'create inventory reservation'));
  }

  async lockActiveReservationForUpdate(
    input: LockInventoryReservationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryReservationRecord | null> {
    const result = await client.query<InventoryReservationRow>(
      `
        select
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity::text,
          reserved_quantity::text,
          status,
          reserved_at,
          released_at,
          consumed_at
        from inventory_reservations
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = $3
        limit 1
        for update
      `,
      [input.tenantId, input.reservationId, INVENTORY_RESERVATION_STATUSES.ACTIVE],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapInventoryReservationRow(row);
  }

  async markReservationReleased(
    input: ReleaseInventoryReservationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryReservationRecord | null> {
    const result = await client.query<InventoryReservationRow>(
      `
        update inventory_reservations
        set
          reserved_quantity = 0::numeric(14,3),
          status = $3,
          released_at = $4::timestamptz
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = $5
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity::text,
          reserved_quantity::text,
          status,
          reserved_at,
          released_at,
          consumed_at
      `,
      [
        input.tenantId,
        input.reservationId,
        INVENTORY_RESERVATION_STATUSES.RELEASED,
        input.releasedAt,
        INVENTORY_RESERVATION_STATUSES.ACTIVE,
      ],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapInventoryReservationRow(row);
  }

  async decrementActiveReservationQuantity(
    input: PartiallyReleaseInventoryReservationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryReservationRecord | null> {
    const result = await client.query<InventoryReservationRow>(
      `
        update inventory_reservations
        set reserved_quantity = reserved_quantity - $3::numeric(14,3)
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = $4
          and reserved_quantity > $3::numeric(14,3)
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity::text,
          reserved_quantity::text,
          status,
          reserved_at,
          released_at,
          consumed_at
      `,
      [
        input.tenantId,
        input.reservationId,
        input.releaseQuantity,
        INVENTORY_RESERVATION_STATUSES.ACTIVE,
      ],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapInventoryReservationRow(row);
  }

  async markReservationConsumed(
    input: ConsumeInventoryReservationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryReservationRecord | null> {
    const result = await client.query<InventoryReservationRow>(
      `
        update inventory_reservations
        set
          reserved_quantity = 0::numeric(14,3),
          status = $3,
          consumed_at = $4::timestamptz
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = $5
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          source_type,
          source_id,
          requested_quantity::text,
          reserved_quantity::text,
          status,
          reserved_at,
          released_at,
          consumed_at
      `,
      [
        input.tenantId,
        input.reservationId,
        INVENTORY_RESERVATION_STATUSES.CONSUMED,
        input.consumedAt,
        INVENTORY_RESERVATION_STATUSES.ACTIVE,
      ],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapInventoryReservationRow(row);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Inventory reservation repository failed to ${operation}.`);
  }

  return row;
}

function mapInventoryReservationRow(row: InventoryReservationRow): InventoryReservationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    requestedQuantity: row.requested_quantity,
    reservedQuantity: row.reserved_quantity,
    status: mapInventoryReservationStatus(row.status),
    reservedAt: toDate(row.reserved_at),
    releasedAt: toNullableDate(row.released_at),
    consumedAt: toNullableDate(row.consumed_at),
  };
}

function mapInventoryReservationStatus(status: string): InventoryReservationStatus {
  if ((INVENTORY_RESERVATION_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as InventoryReservationStatus;
  }

  throw new Error(`Unknown inventory reservation status: ${status}.`);
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
