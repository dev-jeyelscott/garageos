export const INVENTORY_ADJUSTMENT_STATUSES = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  POSTED: 'posted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export const INVENTORY_ADJUSTMENT_STATUS_VALUES = Object.values(INVENTORY_ADJUSTMENT_STATUSES);

export type InventoryAdjustmentStatus =
  (typeof INVENTORY_ADJUSTMENT_STATUSES)[keyof typeof INVENTORY_ADJUSTMENT_STATUSES];

export const INVENTORY_ADJUSTMENT_TYPES = {
  INCREASE: 'increase',
  DECREASE: 'decrease',
  FINAL_COUNT: 'final_count',
} as const;

export const INVENTORY_ADJUSTMENT_TYPE_VALUES = Object.values(INVENTORY_ADJUSTMENT_TYPES);

export type InventoryAdjustmentType =
  (typeof INVENTORY_ADJUSTMENT_TYPES)[keyof typeof INVENTORY_ADJUSTMENT_TYPES];

export interface InventoryAdjustmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly adjustmentNumber: string;
  readonly status: InventoryAdjustmentStatus;
  readonly reason: string;
  readonly valueImpact: string;
  readonly approvalRequired: boolean;
  readonly requestedByUserId: string;
  readonly approvedByUserId: string | null;
  readonly postedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface InventoryAdjustmentLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly productId: string;
  readonly adjustmentType: InventoryAdjustmentType;
  readonly quantityDifference: string | null;
  readonly finalCountedQuantity: string | null;
  readonly unitCost: string | null;
  readonly estimatedFifoCost: string | null;
}

export interface InventoryAdjustmentStatusEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly fromStatus: InventoryAdjustmentStatus | null;
  readonly toStatus: InventoryAdjustmentStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface InventoryAdjustmentWithLinesRecord {
  readonly adjustment: InventoryAdjustmentRecord;
  readonly lines: readonly InventoryAdjustmentLineRecord[];
}

export interface InventoryAdjustmentListRecord extends InventoryAdjustmentRecord {
  readonly lineCount: number;
}
