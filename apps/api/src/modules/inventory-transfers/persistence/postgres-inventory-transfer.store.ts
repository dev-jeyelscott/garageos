import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateDraftTransferInput,
  type CreateDraftTransferLinesInput,
  type FindLatestTransferNumberForDateInput,
  type InsertStatusEventInput,
  InventoryTransferStore,
} from '../application/inventory-transfer.store';
import {
  type InventoryTransferLineRecord,
  type InventoryTransferRecord,
  type InventoryTransferStatusEventRecord,
} from '../application/inventory-transfer.records';
import {
  type InventoryTransferLineRow,
  type InventoryTransferRow,
  type InventoryTransferStatusEventRow,
  mapInventoryTransferLineRow,
  mapInventoryTransferRow,
  mapInventoryTransferStatusEventRow,
} from '../application/inventory-transfer.mappers';

const INVENTORY_TRANSFER_COLUMNS = `
  id,
  tenant_id,
  transfer_number,
  source_branch_id,
  destination_branch_id,
  status,
  created_by_user_id,
  sent_by_user_id,
  received_by_user_id,
  cancelled_by_user_id,
  sent_at,
  received_at,
  cancelled_at,
  cancellation_disposition,
  remarks,
  created_at,
  updated_at,
  lock_version
`;

const INVENTORY_TRANSFER_LINE_COLUMNS = `
  id,
  tenant_id,
  transfer_id,
  product_id,
  requested_quantity::text,
  reserved_quantity::text,
  sent_quantity::text,
  received_quantity::text,
  variance_quantity::text,
  variance_reason,
  reservation_id
`;

const INVENTORY_TRANSFER_STATUS_EVENT_COLUMNS = `
  id,
  tenant_id,
  transfer_id,
  from_status,
  to_status,
  reason,
  created_by_user_id,
  created_at
`;

@Injectable()
export class PostgresInventoryTransferStore extends InventoryTransferStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createDraftTransfer(
    input: CreateDraftTransferInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryTransferRecord> {
    const result = await client.query<InventoryTransferRow>(
      `
        insert into inventory_transfers (
          id,
          tenant_id,
          transfer_number,
          source_branch_id,
          destination_branch_id,
          status,
          remarks,
          created_by_user_id,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3,
          $4::uuid,
          $5::uuid,
          'draft',
          $6,
          $7::uuid,
          $8::timestamptz,
          $8::timestamptz
        )
        returning ${INVENTORY_TRANSFER_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.transferNumber,
        input.sourceBranchId,
        input.destinationBranchId,
        input.remarks,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInventoryTransferRow(getRequiredRow(result, 'create draft transfer'));
  }

  async createDraftTransferLines(
    input: CreateDraftTransferLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryTransferLineRecord[]> {
    if (input.lines.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.lines.map((line, index) => {
      const offset = index * 5;
      values.push(
        input.tenantId,
        line.id,
        input.transferId,
        line.productId,
        line.requestedQuantity,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::numeric(14,3)
      )`;
    });

    const result = await client.query<InventoryTransferLineRow>(
      `
        insert into inventory_transfer_lines (
          tenant_id,
          id,
          transfer_id,
          product_id,
          requested_quantity
        )
        values ${placeholders.join(', ')}
        returning ${INVENTORY_TRANSFER_LINE_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInventoryTransferLineRow);
  }

  async insertStatusEvent(
    input: InsertStatusEventInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryTransferStatusEventRecord> {
    const result = await client.query<InventoryTransferStatusEventRow>(
      `
        insert into inventory_transfer_status_events (
          id,
          tenant_id,
          transfer_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6,
          $7::uuid,
          $8::timestamptz
        )
        returning ${INVENTORY_TRANSFER_STATUS_EVENT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.transferId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInventoryTransferStatusEventRow(getRequiredRow(result, 'insert status event'));
  }

  async findLatestTransferNumberForDate(
    input: FindLatestTransferNumberForDateInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const sequenceDate = `${input.datePrefix.slice(3, 7)}-${input.datePrefix.slice(
      7,
      9,
    )}-${input.datePrefix.slice(9, 11)}`;
    const result = await client.query<{ last_value: number }>(
      `
        insert into document_sequences (
          tenant_id,
          sequence_type,
          sequence_date,
          last_value,
          updated_at
        )
        values ($1::uuid, 'inventory_transfer', $2::date, 1, now())
        on conflict (tenant_id, sequence_type, sequence_date)
        do update set
          last_value = document_sequences.last_value + 1,
          updated_at = now()
        returning last_value
      `,
      [input.tenantId, sequenceDate],
    );
    const lastValue = result.rows[0]?.last_value;

    return lastValue === undefined
      ? null
      : `${input.datePrefix}-${lastValue.toString().padStart(6, '0')}`;
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Inventory transfer store failed to ${operation}.`);
  }

  return row;
}
