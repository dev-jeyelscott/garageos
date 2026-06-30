import type { InventoryAdjustmentRecord } from './inventory-adjustment.records';

export function toInventoryAdjustmentAuditSnapshot(
  adjustment: InventoryAdjustmentRecord,
): Record<string, unknown> {
  return {
    id: adjustment.id,
    branch_id: adjustment.branchId,
    adjustment_number: adjustment.adjustmentNumber,
    status: adjustment.status,
    value_impact: adjustment.valueImpact,
    approval_required: adjustment.approvalRequired,
    posted_at: adjustment.postedAt?.toISOString() ?? null,
    lock_version: adjustment.lockVersion,
  };
}
