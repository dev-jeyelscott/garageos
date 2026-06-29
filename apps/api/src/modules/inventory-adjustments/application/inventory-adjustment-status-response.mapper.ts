import type {
  InventoryAdjustmentLineRecord,
  InventoryAdjustmentRecord,
} from './inventory-adjustment.records';

export interface InventoryAdjustmentStatusResponse {
  readonly adjustment: {
    readonly id: string;
    readonly adjustment_number: string;
    readonly branch_id: string;
    readonly status: string;
    readonly reason: string;
    readonly value_impact: string;
    readonly approval_required: boolean;
    readonly requested_by_user_id: string;
    readonly approved_by_user_id: string | null;
    readonly posted_at: string | null;
    readonly created_at: string;
    readonly updated_at: string;
    readonly lock_version: number;
  };
  readonly lines: readonly {
    readonly id: string;
    readonly product_id: string;
    readonly adjustment_type: string;
    readonly quantity_difference: string | null;
    readonly final_counted_quantity: string | null;
    readonly unit_cost: string | null;
    readonly estimated_fifo_cost: string | null;
  }[];
  readonly available_actions: readonly string[];
}

export function toInventoryAdjustmentStatusResponse(
  adjustment: InventoryAdjustmentRecord,
  lines: readonly InventoryAdjustmentLineRecord[],
): InventoryAdjustmentStatusResponse {
  return {
    adjustment: {
      id: adjustment.id,
      adjustment_number: adjustment.adjustmentNumber,
      branch_id: adjustment.branchId,
      status: adjustment.status,
      reason: adjustment.reason,
      value_impact: adjustment.valueImpact,
      approval_required: adjustment.approvalRequired,
      requested_by_user_id: adjustment.requestedByUserId,
      approved_by_user_id: adjustment.approvedByUserId,
      posted_at: adjustment.postedAt?.toISOString() ?? null,
      created_at: adjustment.createdAt.toISOString(),
      updated_at: adjustment.updatedAt.toISOString(),
      lock_version: adjustment.lockVersion,
    },
    lines: lines.map((line) => ({
      id: line.id,
      product_id: line.productId,
      adjustment_type: toApiAdjustmentType(line.adjustmentType),
      quantity_difference: line.quantityDifference,
      final_counted_quantity: line.finalCountedQuantity,
      unit_cost: line.unitCost,
      estimated_fifo_cost: line.estimatedFifoCost,
    })),
    available_actions: getAvailableActions(adjustment),
  };
}

function getAvailableActions(adjustment: InventoryAdjustmentRecord): readonly string[] {
  if (adjustment.status === 'draft') {
    return adjustment.approvalRequired ? ['submit', 'cancel'] : ['post', 'cancel'];
  }

  if (adjustment.status === 'pending_approval') {
    return ['approve', 'reject', 'cancel'];
  }

  if (adjustment.status === 'approved') {
    return ['post'];
  }

  return [];
}

function toApiAdjustmentType(adjustmentType: string): string {
  if (adjustmentType === 'increase') {
    return 'positive_adjustment';
  }

  if (adjustmentType === 'decrease') {
    return 'negative_adjustment';
  }

  return 'final_counted_quantity';
}
