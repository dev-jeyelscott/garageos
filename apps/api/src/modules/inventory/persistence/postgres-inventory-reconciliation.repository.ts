import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  INVENTORY_RECONCILIATION_ISSUE_CODE_VALUES,
  INVENTORY_RECONCILIATION_ISSUE_SEVERITY_VALUES,
  INVENTORY_RECONCILIATION_REFERENCE_TYPE_VALUES,
  InventoryReconciliationStore,
  type CheckInventoryReconciliationInput,
  type InventoryReconciliationIssueCode,
  type InventoryReconciliationIssueRecord,
  type InventoryReconciliationIssueSeverity,
  type InventoryReconciliationReferenceType,
} from '../application/inventory-reconciliation.store';

interface InventoryReconciliationIssueRow extends DatabaseRow {
  readonly issue_code: string;
  readonly severity: string;
  readonly reference_type: string;
  readonly reference_id: string | null;
  readonly tenant_id: string;
  readonly branch_id: string | null;
  readonly product_id: string | null;
  readonly expected_quantity: string | null;
  readonly actual_quantity: string | null;
  readonly difference_quantity: string | null;
  readonly details_json: unknown;
}

@Injectable()
export class PostgresInventoryReconciliationRepository extends InventoryReconciliationStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async listReconciliationIssues(
    input: CheckInventoryReconciliationInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReconciliationIssueRecord[]> {
    const result = await client.query<InventoryReconciliationIssueRow>(
      `
        with scoped_stock_balances as (
          select
            tenant_id,
            branch_id,
            product_id,
            on_hand_qty,
            reserved_qty
          from stock_balances
          where tenant_id = $1::uuid
            and ($2::uuid is null or branch_id = $2::uuid)
            and ($3::uuid is null or product_id = $3::uuid)
        ),
        ledger_totals as (
          select
            tenant_id,
            branch_id,
            product_id,
            coalesce(sum(quantity_delta_on_hand), 0)::numeric(14,3) as ledger_on_hand_qty,
            coalesce(sum(quantity_delta_reserved), 0)::numeric(14,3) as ledger_reserved_qty
          from inventory_ledger_entries
          where tenant_id = $1::uuid
            and ($2::uuid is null or branch_id = $2::uuid)
            and ($3::uuid is null or product_id = $3::uuid)
          group by tenant_id, branch_id, product_id
        ),
        active_reservation_totals as (
          select
            tenant_id,
            branch_id,
            product_id,
            coalesce(sum(reserved_quantity), 0)::numeric(14,3) as active_reserved_qty
          from inventory_reservations
          where tenant_id = $1::uuid
            and status = 'active'
            and ($2::uuid is null or branch_id = $2::uuid)
            and ($3::uuid is null or product_id = $3::uuid)
          group by tenant_id, branch_id, product_id
        ),
        scoped_fifo_layers as (
          select
            id,
            tenant_id,
            branch_id,
            product_id,
            quantity_received,
            remaining_quantity
          from fifo_layers
          where tenant_id = $1::uuid
            and ($2::uuid is null or branch_id = $2::uuid)
            and ($3::uuid is null or product_id = $3::uuid)
        ),
        fifo_remaining_totals as (
          select
            tenant_id,
            branch_id,
            product_id,
            coalesce(sum(remaining_quantity), 0)::numeric(14,3) as fifo_remaining_qty
          from scoped_fifo_layers
          group by tenant_id, branch_id, product_id
        ),
        reconciliation_keys as (
          select tenant_id, branch_id, product_id from scoped_stock_balances
          union
          select tenant_id, branch_id, product_id from ledger_totals
          union
          select tenant_id, branch_id, product_id from active_reservation_totals
          union
          select tenant_id, branch_id, product_id from fifo_remaining_totals
        ),
        quantity_summaries as (
          select
            reconciliation_keys.tenant_id,
            reconciliation_keys.branch_id,
            reconciliation_keys.product_id,
            stock_balances.on_hand_qty as stock_on_hand_qty,
            stock_balances.reserved_qty as stock_reserved_qty,
            ledger_totals.ledger_on_hand_qty,
            ledger_totals.ledger_reserved_qty,
            active_reservation_totals.active_reserved_qty,
            fifo_remaining_totals.fifo_remaining_qty
          from reconciliation_keys
          left join scoped_stock_balances stock_balances
            on stock_balances.tenant_id = reconciliation_keys.tenant_id
           and stock_balances.branch_id = reconciliation_keys.branch_id
           and stock_balances.product_id = reconciliation_keys.product_id
          left join ledger_totals
            on ledger_totals.tenant_id = reconciliation_keys.tenant_id
           and ledger_totals.branch_id = reconciliation_keys.branch_id
           and ledger_totals.product_id = reconciliation_keys.product_id
          left join active_reservation_totals
            on active_reservation_totals.tenant_id = reconciliation_keys.tenant_id
           and active_reservation_totals.branch_id = reconciliation_keys.branch_id
           and active_reservation_totals.product_id = reconciliation_keys.product_id
          left join fifo_remaining_totals
            on fifo_remaining_totals.tenant_id = reconciliation_keys.tenant_id
           and fifo_remaining_totals.branch_id = reconciliation_keys.branch_id
           and fifo_remaining_totals.product_id = reconciliation_keys.product_id
        ),
        active_reservations as (
          select
            id,
            tenant_id,
            branch_id,
            product_id,
            reserved_quantity
          from inventory_reservations
          where tenant_id = $1::uuid
            and status = 'active'
            and ($2::uuid is null or branch_id = $2::uuid)
            and ($3::uuid is null or product_id = $3::uuid)
        ),
        active_allocations as (
          select
            id,
            tenant_id,
            reservation_id,
            fifo_layer_id,
            reserved_quantity
          from fifo_reservation_allocations
          where tenant_id = $1::uuid
            and status = 'active'
        ),
        active_allocation_totals_by_reservation as (
          select
            active_reservations.id as reservation_id,
            coalesce(sum(active_allocations.reserved_quantity), 0)::numeric(14,3)
              as active_allocated_qty
          from active_reservations
          left join active_allocations
            on active_allocations.tenant_id = active_reservations.tenant_id
           and active_allocations.reservation_id = active_reservations.id
          group by active_reservations.id
        ),
        active_allocation_totals_by_layer as (
          select
            scoped_fifo_layers.id as fifo_layer_id,
            coalesce(sum(active_allocations.reserved_quantity), 0)::numeric(14,3)
              as active_allocated_qty
          from scoped_fifo_layers
          left join active_allocations
            on active_allocations.tenant_id = scoped_fifo_layers.tenant_id
           and active_allocations.fifo_layer_id = scoped_fifo_layers.id
          group by scoped_fifo_layers.id
        )
        select
          'stock_balance_ledger_on_hand_mismatch' as issue_code,
          'critical' as severity,
          'stock_balance' as reference_type,
          null::uuid as reference_id,
          tenant_id,
          branch_id,
          product_id,
          coalesce(ledger_on_hand_qty, 0::numeric)::text as expected_quantity,
          coalesce(stock_on_hand_qty, 0::numeric)::text as actual_quantity,
          (
            coalesce(stock_on_hand_qty, 0::numeric)
            - coalesce(ledger_on_hand_qty, 0::numeric)
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'inventory_ledger_entries.quantity_delta_on_hand',
            'actual_source', 'stock_balances.on_hand_qty'
          ) as details_json
        from quantity_summaries
        where coalesce(stock_on_hand_qty, 0::numeric)
          <> coalesce(ledger_on_hand_qty, 0::numeric)

        union all

        select
          'stock_balance_ledger_reserved_mismatch' as issue_code,
          'critical' as severity,
          'stock_balance' as reference_type,
          null::uuid as reference_id,
          tenant_id,
          branch_id,
          product_id,
          coalesce(ledger_reserved_qty, 0::numeric)::text as expected_quantity,
          coalesce(stock_reserved_qty, 0::numeric)::text as actual_quantity,
          (
            coalesce(stock_reserved_qty, 0::numeric)
            - coalesce(ledger_reserved_qty, 0::numeric)
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'inventory_ledger_entries.quantity_delta_reserved',
            'actual_source', 'stock_balances.reserved_qty'
          ) as details_json
        from quantity_summaries
        where coalesce(stock_reserved_qty, 0::numeric)
          <> coalesce(ledger_reserved_qty, 0::numeric)

        union all

        select
          'stock_balance_active_reservation_mismatch' as issue_code,
          'critical' as severity,
          'stock_balance' as reference_type,
          null::uuid as reference_id,
          tenant_id,
          branch_id,
          product_id,
          coalesce(active_reserved_qty, 0::numeric)::text as expected_quantity,
          coalesce(stock_reserved_qty, 0::numeric)::text as actual_quantity,
          (
            coalesce(stock_reserved_qty, 0::numeric)
            - coalesce(active_reserved_qty, 0::numeric)
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'active inventory_reservations.reserved_quantity',
            'actual_source', 'stock_balances.reserved_qty'
          ) as details_json
        from quantity_summaries
        where coalesce(stock_reserved_qty, 0::numeric)
          <> coalesce(active_reserved_qty, 0::numeric)

        union all

        select
          'stock_balance_fifo_remaining_mismatch' as issue_code,
          'critical' as severity,
          'stock_balance' as reference_type,
          null::uuid as reference_id,
          tenant_id,
          branch_id,
          product_id,
          coalesce(fifo_remaining_qty, 0::numeric)::text as expected_quantity,
          coalesce(stock_on_hand_qty, 0::numeric)::text as actual_quantity,
          (
            coalesce(stock_on_hand_qty, 0::numeric)
            - coalesce(fifo_remaining_qty, 0::numeric)
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'fifo_layers.remaining_quantity',
            'actual_source', 'stock_balances.on_hand_qty'
          ) as details_json
        from quantity_summaries
        where coalesce(stock_on_hand_qty, 0::numeric)
          <> coalesce(fifo_remaining_qty, 0::numeric)

        union all

        select
          'active_reservation_fifo_allocation_mismatch' as issue_code,
          'critical' as severity,
          'inventory_reservation' as reference_type,
          active_reservations.id as reference_id,
          active_reservations.tenant_id,
          active_reservations.branch_id,
          active_reservations.product_id,
          active_reservations.reserved_quantity::text as expected_quantity,
          active_allocation_totals_by_reservation.active_allocated_qty::text
            as actual_quantity,
          (
            active_allocation_totals_by_reservation.active_allocated_qty
            - active_reservations.reserved_quantity
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'inventory_reservations.reserved_quantity',
            'actual_source', 'active fifo_reservation_allocations.reserved_quantity'
          ) as details_json
        from active_reservations
        inner join active_allocation_totals_by_reservation
          on active_allocation_totals_by_reservation.reservation_id = active_reservations.id
        where active_reservations.reserved_quantity
          <> active_allocation_totals_by_reservation.active_allocated_qty

        union all

        select
          'fifo_layer_active_allocation_exceeds_remaining' as issue_code,
          'critical' as severity,
          'fifo_layer' as reference_type,
          scoped_fifo_layers.id as reference_id,
          scoped_fifo_layers.tenant_id,
          scoped_fifo_layers.branch_id,
          scoped_fifo_layers.product_id,
          scoped_fifo_layers.remaining_quantity::text as expected_quantity,
          active_allocation_totals_by_layer.active_allocated_qty::text as actual_quantity,
          (
            active_allocation_totals_by_layer.active_allocated_qty
            - scoped_fifo_layers.remaining_quantity
          )::text as difference_quantity,
          jsonb_build_object(
            'expected_source', 'fifo_layers.remaining_quantity',
            'actual_source', 'active fifo_reservation_allocations.reserved_quantity'
          ) as details_json
        from scoped_fifo_layers
        inner join active_allocation_totals_by_layer
          on active_allocation_totals_by_layer.fifo_layer_id = scoped_fifo_layers.id
        where active_allocation_totals_by_layer.active_allocated_qty
          > scoped_fifo_layers.remaining_quantity

        union all

        select
          'fifo_layer_remaining_out_of_bounds' as issue_code,
          'critical' as severity,
          'fifo_layer' as reference_type,
          id as reference_id,
          tenant_id,
          branch_id,
          product_id,
          quantity_received::text as expected_quantity,
          remaining_quantity::text as actual_quantity,
          (remaining_quantity - quantity_received)::text as difference_quantity,
          jsonb_build_object(
            'quantity_received', quantity_received::text,
            'remaining_quantity', remaining_quantity::text,
            'rule', 'remaining_quantity must be between 0 and quantity_received'
          ) as details_json
        from scoped_fifo_layers
        where remaining_quantity < 0::numeric
           or remaining_quantity > quantity_received

        union all

        select
          'fifo_allocation_active_reference_conflict' as issue_code,
          'critical' as severity,
          'fifo_reservation_allocation' as reference_type,
          active_allocations.id as reference_id,
          active_allocations.tenant_id,
          coalesce(inventory_reservations.branch_id, fifo_layers.branch_id) as branch_id,
          coalesce(inventory_reservations.product_id, fifo_layers.product_id) as product_id,
          null::text as expected_quantity,
          active_allocations.reserved_quantity::text as actual_quantity,
          null::text as difference_quantity,
          jsonb_build_object(
            'reservation_id', active_allocations.reservation_id,
            'reservation_status', inventory_reservations.status,
            'fifo_layer_id', active_allocations.fifo_layer_id,
            'has_fifo_layer', fifo_layers.id is not null,
            'rule', 'active allocations must reference an active reservation and existing FIFO layer'
          ) as details_json
        from active_allocations
        left join inventory_reservations
          on inventory_reservations.tenant_id = active_allocations.tenant_id
         and inventory_reservations.id = active_allocations.reservation_id
        left join fifo_layers
          on fifo_layers.tenant_id = active_allocations.tenant_id
         and fifo_layers.id = active_allocations.fifo_layer_id
        where (
            inventory_reservations.id is null
            or inventory_reservations.status <> 'active'
            or fifo_layers.id is null
          )
          and (
            $2::uuid is null
            or coalesce(inventory_reservations.branch_id, fifo_layers.branch_id) = $2::uuid
          )
          and (
            $3::uuid is null
            or coalesce(inventory_reservations.product_id, fifo_layers.product_id) = $3::uuid
          )
        order by issue_code, tenant_id, branch_id, product_id, reference_id
      `,
      [input.tenantId, input.branchId, input.productId],
    );

    return result.rows.map(mapInventoryReconciliationIssueRow);
  }
}

function mapInventoryReconciliationIssueRow(
  row: InventoryReconciliationIssueRow,
): InventoryReconciliationIssueRecord {
  return {
    issueCode: mapInventoryReconciliationIssueCode(row.issue_code),
    severity: mapInventoryReconciliationIssueSeverity(row.severity),
    referenceType: mapInventoryReconciliationReferenceType(row.reference_type),
    referenceId: row.reference_id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    expectedQuantity: row.expected_quantity,
    actualQuantity: row.actual_quantity,
    differenceQuantity: row.difference_quantity,
    details: normalizeDetails(row.details_json),
  };
}

function mapInventoryReconciliationIssueCode(issueCode: string): InventoryReconciliationIssueCode {
  if ((INVENTORY_RECONCILIATION_ISSUE_CODE_VALUES as readonly string[]).includes(issueCode)) {
    return issueCode as InventoryReconciliationIssueCode;
  }

  throw new Error(`Unknown inventory reconciliation issue code: ${issueCode}.`);
}

function mapInventoryReconciliationIssueSeverity(
  severity: string,
): InventoryReconciliationIssueSeverity {
  if ((INVENTORY_RECONCILIATION_ISSUE_SEVERITY_VALUES as readonly string[]).includes(severity)) {
    return severity as InventoryReconciliationIssueSeverity;
  }

  throw new Error(`Unknown inventory reconciliation severity: ${severity}.`);
}

function mapInventoryReconciliationReferenceType(
  referenceType: string,
): InventoryReconciliationReferenceType {
  if (
    (INVENTORY_RECONCILIATION_REFERENCE_TYPE_VALUES as readonly string[]).includes(referenceType)
  ) {
    return referenceType as InventoryReconciliationReferenceType;
  }

  throw new Error(`Unknown inventory reconciliation reference type: ${referenceType}.`);
}

function normalizeDetails(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
}
