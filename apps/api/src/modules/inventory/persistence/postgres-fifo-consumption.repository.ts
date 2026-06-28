import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  FifoConsumptionStore,
  type CreateFifoConsumptionInput,
  type FifoConsumptionRecord,
} from '../application/fifo-consumption.store';

interface FifoConsumptionRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly fifo_layer_id: string;
  readonly quantity_consumed: string;
  readonly unit_cost: string;
  readonly total_cost: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly consumed_at: Date | string;
}

@Injectable()
export class PostgresFifoConsumptionRepository extends FifoConsumptionStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createConsumptions(
    inputs: readonly CreateFifoConsumptionInput[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly FifoConsumptionRecord[]> {
    const consumptions: FifoConsumptionRecord[] = [];

    for (const input of inputs) {
      consumptions.push(await this.createConsumption(input, client));
    }

    return consumptions;
  }

  private async createConsumption(
    input: CreateFifoConsumptionInput,
    client: DatabaseQueryClient,
  ): Promise<FifoConsumptionRecord> {
    const result = await client.query<FifoConsumptionRow>(
      `
        insert into fifo_consumptions (
          id,
          tenant_id,
          branch_id,
          product_id,
          fifo_layer_id,
          quantity_consumed,
          unit_cost,
          total_cost,
          source_type,
          source_id,
          consumed_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::numeric(14,3),
          $7::numeric(14,2),
          $8::numeric(14,2),
          $9,
          $10::uuid,
          $11::timestamptz
        )
        returning
          id,
          tenant_id,
          branch_id,
          product_id,
          fifo_layer_id,
          quantity_consumed::text,
          unit_cost::text,
          total_cost::text,
          source_type,
          source_id,
          consumed_at
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.productId,
        input.fifoLayerId,
        input.quantityConsumed,
        input.unitCost,
        input.totalCost,
        input.sourceType,
        input.sourceId,
        input.consumedAt,
      ],
    );

    return mapFifoConsumptionRow(getRequiredRow(result, 'create FIFO consumption'));
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`FIFO consumption repository failed to ${operation}.`);
  }

  return row;
}

function mapFifoConsumptionRow(row: FifoConsumptionRow): FifoConsumptionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    fifoLayerId: row.fifo_layer_id,
    quantityConsumed: row.quantity_consumed,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
    sourceType: row.source_type,
    sourceId: row.source_id,
    consumedAt: toDate(row.consumed_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
