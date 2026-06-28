import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES,
  FifoLayerStore,
  type CreateFifoLayerInput,
  type FifoLayerAllocationCandidateRecord,
  type FifoLayerRecord,
  type FifoLayerSourceTransactionType,
  type LockOpenFifoLayersForAllocationInput,
} from '../application/fifo-layer.store';

interface FifoLayerRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly quantity_received: string;
  readonly remaining_quantity: string;
  readonly unit_cost: string;
  readonly source_transaction_type: string;
  readonly source_transaction_id: string;
  readonly received_at: Date | string;
  readonly original_source_layer_id: string | null;
}

interface FifoLayerAllocationCandidateRow extends FifoLayerRow {
  readonly active_reserved_quantity: string;
  readonly allocatable_quantity: string;
}

@Injectable()
export class PostgresFifoLayerRepository extends FifoLayerStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createLayer(
    input: CreateFifoLayerInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<FifoLayerRecord> {
    const result = await client.query<FifoLayerRow>(
      `
        insert into fifo_layers (
          id,
          tenant_id,
          branch_id,
          product_id,
          quantity_received,
          remaining_quantity,
          unit_cost,
          source_transaction_type,
          source_transaction_id,
          received_at,
          original_source_layer_id
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::numeric(14,3),
          $6::numeric(14,3),
          $7::numeric(14,2),
          $8,
          $9::uuid,
          $10::timestamptz,
          $11::uuid
        )
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          quantity_received::text,
          remaining_quantity::text,
          unit_cost::text,
          source_transaction_type,
          source_transaction_id,
          received_at,
          original_source_layer_id
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.productId,
        input.quantityReceived,
        input.remainingQuantity,
        input.unitCost,
        input.sourceTransactionType,
        input.sourceTransactionId,
        input.receivedAt,
        input.originalSourceLayerId,
      ],
    );

    return mapFifoLayerRow(getRequiredRow(result, 'create FIFO layer'));
  }

  async lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    const result = await client.query<FifoLayerAllocationCandidateRow>(
      `
        with locked_layers as (
          select
            id,
            tenant_id,
            branch_id,
            product_id,
            quantity_received,
            remaining_quantity,
            unit_cost,
            source_transaction_type,
            source_transaction_id,
            received_at,
            original_source_layer_id
          from fifo_layers
          where tenant_id = $1::uuid
            and branch_id = $2::uuid
            and product_id = $3::uuid
            and remaining_quantity > 0
          order by received_at asc, id asc
          for update
        ),
        active_allocation_totals as (
          select
            allocation.fifo_layer_id,
            coalesce(sum(allocation.reserved_quantity), 0)::numeric(14,3) as active_reserved_quantity
          from fifo_reservation_allocations allocation
          inner join locked_layers layer
            on layer.tenant_id = allocation.tenant_id
           and layer.id = allocation.fifo_layer_id
          where allocation.status = 'active'
          group by allocation.fifo_layer_id
        )
        select
          layer.id,
          layer.tenant_id,
          layer.branch_id,
          layer.product_id,
          layer.quantity_received::text,
          layer.remaining_quantity::text,
          layer.unit_cost::text,
          layer.source_transaction_type,
          layer.source_transaction_id,
          layer.received_at,
          layer.original_source_layer_id,
          coalesce(allocation.active_reserved_quantity, 0)::text as active_reserved_quantity,
          (
            layer.remaining_quantity - coalesce(allocation.active_reserved_quantity, 0)
          )::text as allocatable_quantity
        from locked_layers layer
        left join active_allocation_totals allocation
          on allocation.fifo_layer_id = layer.id
        where (
          layer.remaining_quantity - coalesce(allocation.active_reserved_quantity, 0)
        ) > 0
        order by layer.received_at asc, layer.id asc
      `,
      [input.tenantId, input.branchId, input.productId],
    );

    return result.rows.map(mapFifoLayerAllocationCandidateRow);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`FIFO layer repository failed to ${operation}.`);
  }

  return row;
}

function mapFifoLayerRow(row: FifoLayerRow): FifoLayerRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    quantityReceived: row.quantity_received,
    remainingQuantity: row.remaining_quantity,
    unitCost: row.unit_cost,
    sourceTransactionType: mapFifoLayerSourceTransactionType(row.source_transaction_type),
    sourceTransactionId: row.source_transaction_id,
    receivedAt: toDate(row.received_at),
    originalSourceLayerId: row.original_source_layer_id,
  };
}

function mapFifoLayerAllocationCandidateRow(
  row: FifoLayerAllocationCandidateRow,
): FifoLayerAllocationCandidateRecord {
  return {
    ...mapFifoLayerRow(row),
    activeReservedQuantity: row.active_reserved_quantity,
    allocatableQuantity: row.allocatable_quantity,
  };
}

function mapFifoLayerSourceTransactionType(
  sourceTransactionType: string,
): FifoLayerSourceTransactionType {
  if (
    (FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES as readonly string[]).includes(sourceTransactionType)
  ) {
    return sourceTransactionType as FifoLayerSourceTransactionType;
  }

  throw new Error(`Unknown FIFO layer source transaction type: ${sourceTransactionType}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
