import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  INVENTORY_TRANSACTION_TYPE_VALUES,
  InventoryLedgerStore,
  type CreateInventoryLedgerEntryInput,
  type InventoryLedgerEntryRecord,
  type InventoryTransactionType,
} from '../application/inventory-ledger.store';

interface InventoryLedgerEntryRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly transaction_type: string;
  readonly quantity_delta_on_hand: string;
  readonly quantity_delta_reserved: string;
  readonly unit_cost: string | null;
  readonly total_cost: string | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly occurred_at: Date | string;
  readonly created_by_user_id: string | null;
}

@Injectable()
export class PostgresInventoryLedgerRepository extends InventoryLedgerStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createLedgerEntry(
    input: CreateInventoryLedgerEntryInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryLedgerEntryRecord> {
    const result = await client.query<InventoryLedgerEntryRow>(
      `
        insert into inventory_ledger_entries (
          id,
          tenant_id,
          branch_id,
          product_id,
          transaction_type,
          quantity_delta_on_hand,
          quantity_delta_reserved,
          unit_cost,
          total_cost,
          source_type,
          source_id,
          occurred_at,
          created_by_user_id
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::numeric(14,3),
          $7::numeric(14,3),
          $8::numeric(14,2),
          $9::numeric(14,2),
          $10,
          $11::uuid,
          $12::timestamptz,
          $13::uuid
        )
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          transaction_type,
          quantity_delta_on_hand::text,
          quantity_delta_reserved::text,
          unit_cost::text,
          total_cost::text,
          source_type,
          source_id,
          occurred_at,
          created_by_user_id
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.productId,
        input.transactionType,
        input.quantityDeltaOnHand,
        input.quantityDeltaReserved,
        input.unitCost,
        input.totalCost,
        input.sourceType,
        input.sourceId,
        input.occurredAt,
        input.createdByUserId,
      ],
    );

    return mapInventoryLedgerEntryRow(getRequiredRow(result, 'create inventory ledger entry'));
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Inventory ledger repository failed to ${operation}.`);
  }

  return row;
}

function mapInventoryLedgerEntryRow(row: InventoryLedgerEntryRow): InventoryLedgerEntryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    transactionType: mapInventoryTransactionType(row.transaction_type),
    quantityDeltaOnHand: row.quantity_delta_on_hand,
    quantityDeltaReserved: row.quantity_delta_reserved,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: toDate(row.occurred_at),
    createdByUserId: row.created_by_user_id,
  };
}

function mapInventoryTransactionType(transactionType: string): InventoryTransactionType {
  if ((INVENTORY_TRANSACTION_TYPE_VALUES as readonly string[]).includes(transactionType)) {
    return transactionType as InventoryTransactionType;
  }

  throw new Error(`Unknown inventory transaction type: ${transactionType}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
