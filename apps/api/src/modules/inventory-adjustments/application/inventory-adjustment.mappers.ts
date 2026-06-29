import type { DatabaseRow } from '../../../shared/database/database-client';
import {
  INVENTORY_ADJUSTMENT_STATUS_VALUES,
  INVENTORY_ADJUSTMENT_TYPE_VALUES,
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentListRecord,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentStatus,
  type InventoryAdjustmentStatusEventRecord,
  type InventoryAdjustmentType,
} from './inventory-adjustment.records';

export interface InventoryAdjustmentRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly adjustment_number: string;
  readonly status: string;
  readonly reason: string;
  readonly value_impact: string;
  readonly approval_required: boolean;
  readonly requested_by_user_id: string;
  readonly approved_by_user_id: string | null;
  readonly posted_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

export interface InventoryAdjustmentLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly adjustment_id: string;
  readonly product_id: string;
  readonly adjustment_type: string;
  readonly quantity_difference: string | null;
  readonly final_counted_quantity: string | null;
  readonly unit_cost: string | null;
  readonly estimated_fifo_cost: string | null;
}

export interface InventoryAdjustmentStatusEventRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly adjustment_id: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly reason: string | null;
  readonly created_by_user_id: string;
  readonly created_at: Date | string;
}

export interface InventoryAdjustmentListRow extends InventoryAdjustmentRow {
  readonly line_count: number | string;
}

export function mapInventoryAdjustmentRow(row: InventoryAdjustmentRow): InventoryAdjustmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    adjustmentNumber: row.adjustment_number,
    status: mapInventoryAdjustmentStatus(row.status),
    reason: row.reason,
    valueImpact: row.value_impact,
    approvalRequired: row.approval_required,
    requestedByUserId: row.requested_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    postedAt: toNullableDate(row.posted_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

export function mapInventoryAdjustmentLineRow(
  row: InventoryAdjustmentLineRow,
): InventoryAdjustmentLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    adjustmentId: row.adjustment_id,
    productId: row.product_id,
    adjustmentType: mapInventoryAdjustmentType(row.adjustment_type),
    quantityDifference: row.quantity_difference,
    finalCountedQuantity: row.final_counted_quantity,
    unitCost: row.unit_cost,
    estimatedFifoCost: row.estimated_fifo_cost,
  };
}

export function mapInventoryAdjustmentStatusEventRow(
  row: InventoryAdjustmentStatusEventRow,
): InventoryAdjustmentStatusEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    adjustmentId: row.adjustment_id,
    fromStatus: row.from_status === null ? null : mapInventoryAdjustmentStatus(row.from_status),
    toStatus: mapInventoryAdjustmentStatus(row.to_status),
    reason: row.reason,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

export function mapInventoryAdjustmentListRow(
  row: InventoryAdjustmentListRow,
): InventoryAdjustmentListRecord {
  return {
    ...mapInventoryAdjustmentRow(row),
    lineCount: Number(row.line_count),
  };
}

function mapInventoryAdjustmentStatus(status: string): InventoryAdjustmentStatus {
  if ((INVENTORY_ADJUSTMENT_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as InventoryAdjustmentStatus;
  }

  throw new Error(`Unknown inventory adjustment status: ${status}.`);
}

function mapInventoryAdjustmentType(adjustmentType: string): InventoryAdjustmentType {
  if ((INVENTORY_ADJUSTMENT_TYPE_VALUES as readonly string[]).includes(adjustmentType)) {
    return adjustmentType as InventoryAdjustmentType;
  }

  throw new Error(`Unknown inventory adjustment type: ${adjustmentType}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}
