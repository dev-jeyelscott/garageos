import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateDraftAdjustmentInput,
  type CreateDraftAdjustmentLinesInput,
  type FifoCostLayerSnapshot,
  type FindAdjustmentWithLinesInput,
  type FindLatestAdjustmentNumberForDateInput,
  type FindTenantAdjustmentApprovalThresholdInput,
  type InsertStatusEventInput,
  InventoryAdjustmentStore,
  type ListAdjustmentsInput,
  type ListFifoCostLayersInput,
  type ListStatusEventsInput,
  type LockAdjustmentWithLinesForPostingInput,
  type LockAdjustmentWithLinesForUpdateInput,
  type MarkAdjustmentApprovedInput,
  type MarkAdjustmentPendingApprovalInput,
  type MarkAdjustmentRejectedInput,
  type ReplaceDraftAdjustmentLinesInput,
  type UpdateDraftAdjustmentInput,
} from '../application/inventory-adjustment.store';
import {
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentListRecord,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentStatusEventRecord,
  type InventoryAdjustmentWithLinesRecord,
} from '../application/inventory-adjustment.records';
import {
  type InventoryAdjustmentLineRow,
  type InventoryAdjustmentListRow,
  type InventoryAdjustmentRow,
  type InventoryAdjustmentStatusEventRow,
  mapInventoryAdjustmentLineRow,
  mapInventoryAdjustmentListRow,
  mapInventoryAdjustmentRow,
  mapInventoryAdjustmentStatusEventRow,
} from '../application/inventory-adjustment.mappers';
import {
  INVENTORY_ADJUSTMENT_COLUMNS,
  INVENTORY_ADJUSTMENT_LINE_COLUMNS,
  INVENTORY_ADJUSTMENT_STATUS_EVENT_COLUMNS,
} from './postgres-inventory-adjustment.sql';

@Injectable()
export class PostgresInventoryAdjustmentStore extends InventoryAdjustmentStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createDraftAdjustment(
    input: CreateDraftAdjustmentInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentRecord> {
    const result = await client.query<InventoryAdjustmentRow>(
      `
        insert into inventory_adjustments (
          id,
          tenant_id,
          branch_id,
          adjustment_number,
          status,
          reason,
          value_impact,
          approval_required,
          requested_by_user_id,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          'draft',
          $5,
          $6::numeric(14,2),
          $7::boolean,
          $8::uuid,
          $9::timestamptz,
          $9::timestamptz
        )
        returning ${INVENTORY_ADJUSTMENT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.adjustmentNumber,
        input.reason,
        input.valueImpact,
        input.approvalRequired,
        input.requestedByUserId,
        input.createdAt,
      ],
    );

    return mapInventoryAdjustmentRow(getRequiredRow(result, 'create draft adjustment'));
  }

  async createDraftAdjustmentLines(
    input: CreateDraftAdjustmentLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryAdjustmentLineRecord[]> {
    if (input.lines.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.lines.map((line, index) => {
      const offset = index * 9;
      values.push(
        line.id,
        input.tenantId,
        input.adjustmentId,
        line.productId,
        line.adjustmentType,
        line.quantityDifference,
        line.finalCountedQuantity,
        line.unitCost,
        line.estimatedFifoCost,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5},
        $${offset + 6}::numeric(14,3),
        $${offset + 7}::numeric(14,3),
        $${offset + 8}::numeric(14,2),
        $${offset + 9}::numeric(14,2)
      )`;
    });

    const result = await client.query<InventoryAdjustmentLineRow>(
      `
        insert into inventory_adjustment_lines (
          id,
          tenant_id,
          adjustment_id,
          product_id,
          adjustment_type,
          quantity_difference,
          final_counted_quantity,
          unit_cost,
          estimated_fifo_cost
        )
        values ${placeholders.join(', ')}
        returning ${INVENTORY_ADJUSTMENT_LINE_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInventoryAdjustmentLineRow);
  }

  async updateDraftAdjustment(
    input: UpdateDraftAdjustmentInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentRecord | null> {
    const result = await client.query<InventoryAdjustmentRow>(
      `
        update inventory_adjustments
        set reason = $3,
            value_impact = $4::numeric(14,2),
            approval_required = $5::boolean,
            updated_at = $6::timestamptz,
            lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'draft'
          and ($7::integer is null or lock_version = $7::integer)
        returning ${INVENTORY_ADJUSTMENT_COLUMNS}
      `,
      [
        input.tenantId,
        input.adjustmentId,
        input.reason,
        input.valueImpact,
        input.approvalRequired,
        input.updatedAt,
        input.lockVersion ?? null,
      ],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInventoryAdjustmentRow(row);
  }

  async replaceDraftAdjustmentLines(
    input: ReplaceDraftAdjustmentLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryAdjustmentLineRecord[]> {
    const draftResult = await client.query(
      `
        select 1 as value
        from inventory_adjustments
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'draft'
      `,
      [input.tenantId, input.adjustmentId],
    );

    if (draftResult.rows[0] === undefined) {
      return [];
    }

    await client.query(
      `
        delete from inventory_adjustment_lines
        where tenant_id = $1::uuid
          and adjustment_id = $2::uuid
      `,
      [input.tenantId, input.adjustmentId],
    );

    return this.createDraftAdjustmentLines(input, client);
  }

  async findAdjustmentWithLines(
    input: FindAdjustmentWithLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentWithLinesRecord | null> {
    const adjustment = await this.findAdjustment(input, client, false);
    if (adjustment === null) {
      return null;
    }

    return {
      adjustment,
      lines: await this.listLines(input, client),
    };
  }

  async lockAdjustmentWithLinesForPosting(
    input: LockAdjustmentWithLinesForPostingInput,
    client: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentWithLinesRecord | null> {
    const adjustment = await this.findAdjustment(input, client, 'posting');
    if (adjustment === null) {
      return null;
    }

    return {
      adjustment,
      lines: await this.listLines(input, client),
    };
  }

  async lockAdjustmentWithLinesForUpdate(
    input: LockAdjustmentWithLinesForUpdateInput,
    client: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentWithLinesRecord | null> {
    const adjustment = await this.findAdjustment(input, client, 'update');
    if (adjustment === null) {
      return null;
    }

    return {
      adjustment,
      lines: await this.listLines(input, client),
    };
  }

  async insertStatusEvent(
    input: InsertStatusEventInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentStatusEventRecord> {
    const result = await client.query<InventoryAdjustmentStatusEventRow>(
      `
        insert into inventory_adjustment_status_events (
          id,
          tenant_id,
          adjustment_id,
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
        returning ${INVENTORY_ADJUSTMENT_STATUS_EVENT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.adjustmentId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInventoryAdjustmentStatusEventRow(getRequiredRow(result, 'insert status event'));
  }

  async markAdjustmentPendingApproval(
    input: MarkAdjustmentPendingApprovalInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentRecord | null> {
    const result = await client.query<InventoryAdjustmentRow>(
      `
        update inventory_adjustments
        set status = 'pending_approval',
            updated_at = $3::timestamptz,
            lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'draft'
        returning ${INVENTORY_ADJUSTMENT_COLUMNS}
      `,
      [input.tenantId, input.adjustmentId, input.updatedAt],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInventoryAdjustmentRow(row);
  }

  async markAdjustmentApproved(
    input: MarkAdjustmentApprovedInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentRecord | null> {
    const result = await client.query<InventoryAdjustmentRow>(
      `
        update inventory_adjustments
        set status = 'approved',
            approved_by_user_id = $3::uuid,
            updated_at = $4::timestamptz,
            lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'pending_approval'
        returning ${INVENTORY_ADJUSTMENT_COLUMNS}
      `,
      [input.tenantId, input.adjustmentId, input.approvedByUserId, input.updatedAt],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInventoryAdjustmentRow(row);
  }

  async markAdjustmentRejected(
    input: MarkAdjustmentRejectedInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InventoryAdjustmentRecord | null> {
    const result = await client.query<InventoryAdjustmentRow>(
      `
        update inventory_adjustments
        set status = 'rejected',
            updated_at = $3::timestamptz,
            lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'pending_approval'
        returning ${INVENTORY_ADJUSTMENT_COLUMNS}
      `,
      [input.tenantId, input.adjustmentId, input.updatedAt],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInventoryAdjustmentRow(row);
  }

  async listStatusEvents(
    input: ListStatusEventsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryAdjustmentStatusEventRecord[]> {
    const result = await client.query<InventoryAdjustmentStatusEventRow>(
      `
        select ${INVENTORY_ADJUSTMENT_STATUS_EVENT_COLUMNS}
        from inventory_adjustment_status_events
        where tenant_id = $1::uuid
          and adjustment_id = $2::uuid
        order by created_at desc, id desc
      `,
      [input.tenantId, input.adjustmentId],
    );

    return result.rows.map(mapInventoryAdjustmentStatusEventRow);
  }

  async listAdjustments(
    input: ListAdjustmentsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryAdjustmentListRecord[]> {
    const result = await client.query<InventoryAdjustmentListRow>(
      `
        select
          adjustment.id,
          adjustment.tenant_id,
          adjustment.branch_id,
          adjustment.adjustment_number,
          adjustment.status,
          adjustment.reason,
          adjustment.value_impact::text,
          adjustment.approval_required,
          adjustment.requested_by_user_id,
          adjustment.approved_by_user_id,
          adjustment.posted_at,
          adjustment.created_at,
          adjustment.updated_at,
          adjustment.lock_version,
          count(line.id)::integer as line_count
        from inventory_adjustments adjustment
        left join inventory_adjustment_lines line
          on line.tenant_id = adjustment.tenant_id
         and line.adjustment_id = adjustment.id
        where adjustment.tenant_id = $1::uuid
          and ($2::uuid is null or adjustment.branch_id = $2::uuid)
          and ($3::text is null or adjustment.status = $3::text)
          and ($4::timestamptz is null or adjustment.created_at >= $4::timestamptz)
          and ($5::timestamptz is null or adjustment.created_at <= $5::timestamptz)
        group by adjustment.id
        order by adjustment.created_at desc, adjustment.id desc
        limit $6
      `,
      [
        input.tenantId,
        input.branchId ?? null,
        input.status ?? null,
        input.fromDate ?? null,
        input.toDate ?? null,
        input.limit,
      ],
    );

    return result.rows.map(mapInventoryAdjustmentListRow);
  }

  async findLatestAdjustmentNumberForDate(
    input: FindLatestAdjustmentNumberForDateInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const result = await client.query<{ adjustment_number: string }>(
      `
        select adjustment_number
        from inventory_adjustments
        where tenant_id = $1::uuid
          and adjustment_number like $2
        order by adjustment_number desc
        limit 1
      `,
      [input.tenantId, `${input.datePrefix}-%`],
    );

    return result.rows[0]?.adjustment_number ?? null;
  }

  async findTenantAdjustmentApprovalThreshold(
    _input: FindTenantAdjustmentApprovalThresholdInput,
    _client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    return null;
  }

  async listFifoCostLayers(
    input: ListFifoCostLayersInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly FifoCostLayerSnapshot[]> {
    const result = await client.query<{
      remaining_quantity: string;
      active_reserved_quantity: string;
      allocatable_quantity: string;
      unit_cost: string;
    }>(
      `
        with active_allocation_totals as (
          select
            allocation.fifo_layer_id,
            coalesce(sum(allocation.reserved_quantity), 0)::numeric(14,3) as active_reserved_quantity
          from fifo_reservation_allocations allocation
          where allocation.tenant_id = $1::uuid
            and allocation.status = 'active'
          group by allocation.fifo_layer_id
        )
        select
          layer.remaining_quantity::text,
          coalesce(allocation.active_reserved_quantity, 0)::text as active_reserved_quantity,
          (
            layer.remaining_quantity - coalesce(allocation.active_reserved_quantity, 0)
          )::text as allocatable_quantity,
          layer.unit_cost::text
        from fifo_layers layer
        left join active_allocation_totals allocation
          on allocation.fifo_layer_id = layer.id
        where layer.tenant_id = $1::uuid
          and layer.branch_id = $2::uuid
          and layer.product_id = $3::uuid
          and layer.remaining_quantity > 0
          and (
            layer.remaining_quantity - coalesce(allocation.active_reserved_quantity, 0)
          ) > 0
        order by layer.received_at asc, layer.id asc
      `,
      [input.tenantId, input.branchId, input.productId],
    );

    return result.rows.map((row) => ({
      remainingQuantity: row.remaining_quantity,
      activeReservedQuantity: row.active_reserved_quantity,
      allocatableQuantity: row.allocatable_quantity,
      unitCost: row.unit_cost,
    }));
  }

  private async findAdjustment(
    input: FindAdjustmentWithLinesInput,
    client: DatabaseQueryClient,
    lockMode: false | 'posting' | 'update',
  ): Promise<InventoryAdjustmentRecord | null> {
    const statusClause =
      lockMode === 'posting'
        ? "and status in ('draft', 'approved')"
        : lockMode === 'update'
          ? "and status in ('draft', 'pending_approval', 'approved')"
          : '';
    const result = await client.query<InventoryAdjustmentRow>(
      `
        select ${INVENTORY_ADJUSTMENT_COLUMNS}
        from inventory_adjustments
        where tenant_id = $1::uuid
          and id = $2::uuid
          ${statusClause}
        ${lockMode ? 'for update' : ''}
      `,
      [input.tenantId, input.adjustmentId],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInventoryAdjustmentRow(row);
  }

  private async listLines(
    input: FindAdjustmentWithLinesInput,
    client: DatabaseQueryClient,
  ): Promise<readonly InventoryAdjustmentLineRecord[]> {
    const result = await client.query<InventoryAdjustmentLineRow>(
      `
        select ${INVENTORY_ADJUSTMENT_LINE_COLUMNS}
        from inventory_adjustment_lines
        where tenant_id = $1::uuid
          and adjustment_id = $2::uuid
        order by id asc
      `,
      [input.tenantId, input.adjustmentId],
    );

    return result.rows.map(mapInventoryAdjustmentLineRow);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Inventory adjustment store failed to ${operation}.`);
  }

  return row;
}
