export const INVENTORY_TRANSFER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const;

export const INVENTORY_TRANSFER_STATUS_VALUES = Object.values(INVENTORY_TRANSFER_STATUSES);

export type InventoryTransferStatus =
  (typeof INVENTORY_TRANSFER_STATUSES)[keyof typeof INVENTORY_TRANSFER_STATUSES];

export interface InventoryTransferRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly transferNumber: string;
  readonly sourceBranchId: string;
  readonly destinationBranchId: string;
  readonly status: InventoryTransferStatus;
  readonly createdByUserId: string;
  readonly sentByUserId: string | null;
  readonly receivedByUserId: string | null;
  readonly cancelledByUserId: string | null;
  readonly sentAt: Date | null;
  readonly receivedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationDisposition: string | null;
  readonly remarks: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface InventoryTransferLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly transferId: string;
  readonly productId: string;
  readonly requestedQuantity: string;
  readonly reservedQuantity: string | null;
  readonly sentQuantity: string | null;
  readonly receivedQuantity: string | null;
  readonly varianceQuantity: string | null;
  readonly varianceReason: string | null;
  readonly reservationId: string | null;
}

export interface InventoryTransferStatusEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly transferId: string;
  readonly fromStatus: InventoryTransferStatus | null;
  readonly toStatus: InventoryTransferStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}
