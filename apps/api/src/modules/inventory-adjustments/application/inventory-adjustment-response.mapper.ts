import type { InventoryAdjustmentRecord } from './inventory-adjustment.records';

export type ApiInventoryAdjustmentType =
  | 'positive_adjustment'
  | 'negative_adjustment'
  | 'final_counted_quantity';

export interface InventoryAdjustmentLineResponse {
  readonly id: string;
  readonly product_id: string;
  readonly adjustment_type: ApiInventoryAdjustmentType;
  readonly quantity_difference: string;
  readonly final_counted_quantity: string | null;
  readonly unit_cost: string | null;
  readonly estimated_fifo_cost: string | null;
  readonly stock_snapshot: {
    readonly on_hand_quantity: string;
    readonly reserved_quantity: string;
    readonly available_quantity: string;
  };
}

export interface InventoryAdjustmentCreateResponse {
  readonly adjustment: {
    readonly id: string;
    readonly adjustment_number: string;
    readonly branch_id: string;
    readonly status: 'draft';
    readonly reason: string;
    readonly value_impact: string;
    readonly approval_required: boolean;
    readonly created_at: string;
    readonly lock_version: number;
  };
  readonly lines: readonly InventoryAdjustmentLineResponse[];
}

export function toCreateInventoryAdjustmentResponse(
  adjustment: InventoryAdjustmentRecord,
  lines: readonly InventoryAdjustmentLineResponse[],
): InventoryAdjustmentCreateResponse {
  return {
    adjustment: {
      id: adjustment.id,
      adjustment_number: adjustment.adjustmentNumber,
      branch_id: adjustment.branchId,
      status: 'draft',
      reason: adjustment.reason,
      value_impact: adjustment.valueImpact,
      approval_required: adjustment.approvalRequired,
      created_at: adjustment.createdAt.toISOString(),
      lock_version: adjustment.lockVersion,
    },
    lines,
  };
}
