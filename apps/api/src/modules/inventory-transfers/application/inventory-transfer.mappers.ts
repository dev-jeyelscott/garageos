export interface InventoryTransferRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly transfer_number: string;
  readonly source_branch_id: string;
  readonly destination_branch_id: string;
  readonly status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled';
  readonly created_by_user_id: string;
  readonly sent_by_user_id: string | null;
  readonly received_by_user_id: string | null;
  readonly cancelled_by_user_id: string | null;
  readonly sent_at: Date | string | null;
  readonly received_at: Date | string | null;
  readonly cancelled_at: Date | string | null;
  readonly cancellation_disposition: string | null;
  readonly remarks: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

export interface InventoryTransferLineRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly transfer_id: string;
  readonly product_id: string;
  readonly requested_quantity: string;
  readonly reserved_quantity: string | null;
  readonly sent_quantity: string | null;
  readonly received_quantity: string | null;
  readonly variance_quantity: string | null;
  readonly variance_reason: string | null;
  readonly reservation_id: string | null;
}

export interface InventoryTransferStatusEventRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly transfer_id: string;
  readonly from_status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled' | null;
  readonly to_status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled';
  readonly reason: string | null;
  readonly created_by_user_id: string;
  readonly created_at: Date | string;
}

export function mapInventoryTransferRow(row: InventoryTransferRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    transferNumber: row.transfer_number,
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    sentByUserId: row.sent_by_user_id,
    receivedByUserId: row.received_by_user_id,
    cancelledByUserId: row.cancelled_by_user_id,
    sentAt: toNullableDate(row.sent_at),
    receivedAt: toNullableDate(row.received_at),
    cancelledAt: toNullableDate(row.cancelled_at),
    cancellationDisposition: row.cancellation_disposition,
    remarks: row.remarks,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

export function mapInventoryTransferLineRow(row: InventoryTransferLineRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    transferId: row.transfer_id,
    productId: row.product_id,
    requestedQuantity: row.requested_quantity,
    reservedQuantity: row.reserved_quantity,
    sentQuantity: row.sent_quantity,
    receivedQuantity: row.received_quantity,
    varianceQuantity: row.variance_quantity,
    varianceReason: row.variance_reason,
    reservationId: row.reservation_id,
  };
}

export function mapInventoryTransferStatusEventRow(row: InventoryTransferStatusEventRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    transferId: row.transfer_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}
