import type {
  InventoryTransferLineRecord,
  InventoryTransferRecord,
} from './inventory-transfer.records';

export interface InventoryTransferCreateResponse {
  readonly transfer: {
    readonly id: string;
    readonly transfer_number: string;
    readonly source_branch_id: string;
    readonly destination_branch_id: string;
    readonly status: 'draft';
    readonly remarks: string | null;
    readonly created_at: string;
    readonly lock_version: number;
  };
  readonly lines: readonly InventoryTransferLineResponse[];
}

export interface InventoryTransferSubmitResponse {
  readonly transfer: {
    readonly id: string;
    readonly transfer_number: string;
    readonly status: 'pending';
    readonly lock_version: number;
  };
  readonly reservations: readonly InventoryTransferReservationResponse[];
}

export interface InventoryTransferSendResponse {
  readonly transfer: {
    readonly id: string;
    readonly transfer_number: string;
    readonly status: 'in_transit';
    readonly sent_at: string;
    readonly lock_version: number;
  };
  readonly lines: readonly InventoryTransferSentLineResponse[];
  readonly released_reservations: readonly InventoryTransferReservationReleaseResponse[];
  readonly ledger_entry_ids: readonly string[];
}

export interface InventoryTransferReceiveResponse {
  readonly transfer: {
    readonly id: string;
    readonly status: 'received';
    readonly received_at: string;
  };
  readonly inventory_effects: {
    readonly source_branch_id: string;
    readonly destination_branch_id: string;
    readonly ledger_entry_ids: readonly string[];
    readonly variance_loss_amount: string;
  };
}

export interface InventoryTransferReservationResponse {
  readonly line_id: string;
  readonly product_id: string;
  readonly reservation_id: string;
  readonly reserved_quantity: string;
  readonly ledger_entry_id: string;
}

export interface InventoryTransferSentLineResponse {
  readonly line_id: string;
  readonly product_id: string;
  readonly sent_quantity: string;
}

export interface InventoryTransferReservationReleaseResponse {
  readonly line_id: string;
  readonly product_id: string;
  readonly reservation_id: string;
  readonly released_quantity: string;
  readonly ledger_entry_id: string;
}

export interface InventoryTransferLineResponse {
  readonly id: string;
  readonly product_id: string;
  readonly requested_quantity: string;
  readonly reserved_quantity: string | null;
  readonly sent_quantity: string | null;
  readonly received_quantity: string | null;
  readonly variance_quantity: string | null;
  readonly reservation_id: string | null;
}

export function toSubmitInventoryTransferResponse(
  transfer: InventoryTransferRecord,
  reservations: readonly InventoryTransferReservationResponse[],
): InventoryTransferSubmitResponse {
  return {
    transfer: {
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      status: 'pending',
      lock_version: transfer.lockVersion,
    },
    reservations,
  };
}

export function toCreateInventoryTransferResponse(
  transfer: InventoryTransferRecord,
  lines: readonly InventoryTransferLineRecord[],
): InventoryTransferCreateResponse {
  return {
    transfer: {
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      source_branch_id: transfer.sourceBranchId,
      destination_branch_id: transfer.destinationBranchId,
      status: 'draft',
      remarks: transfer.remarks,
      created_at: transfer.createdAt.toISOString(),
      lock_version: transfer.lockVersion,
    },
    lines: lines.map(toInventoryTransferLineResponse),
  };
}

export function toSendInventoryTransferResponse(
  transfer: InventoryTransferRecord,
  lines: readonly InventoryTransferSentLineResponse[],
  releasedReservations: readonly InventoryTransferReservationReleaseResponse[],
): InventoryTransferSendResponse {
  if (transfer.sentAt === null) {
    throw new Error('Sent transfer response requires sent_at.');
  }

  return {
    transfer: {
      id: transfer.id,
      transfer_number: transfer.transferNumber,
      status: 'in_transit',
      sent_at: transfer.sentAt.toISOString(),
      lock_version: transfer.lockVersion,
    },
    lines,
    released_reservations: releasedReservations,
    ledger_entry_ids: releasedReservations.map((release) => release.ledger_entry_id),
  };
}

export function toReceiveInventoryTransferResponse(
  transfer: InventoryTransferRecord,
  ledgerEntryIds: readonly string[],
  varianceLossAmount: string,
): InventoryTransferReceiveResponse {
  if (transfer.receivedAt === null) {
    throw new Error('Received transfer response requires received_at.');
  }

  return {
    transfer: {
      id: transfer.id,
      status: 'received',
      received_at: transfer.receivedAt.toISOString(),
    },
    inventory_effects: {
      source_branch_id: transfer.sourceBranchId,
      destination_branch_id: transfer.destinationBranchId,
      ledger_entry_ids: ledgerEntryIds,
      variance_loss_amount: varianceLossAmount,
    },
  };
}

function toInventoryTransferLineResponse(
  line: InventoryTransferLineRecord,
): InventoryTransferLineResponse {
  return {
    id: line.id,
    product_id: line.productId,
    requested_quantity: line.requestedQuantity,
    reserved_quantity: line.reservedQuantity,
    sent_quantity: line.sentQuantity,
    received_quantity: line.receivedQuantity,
    variance_quantity: line.varianceQuantity,
    reservation_id: line.reservationId,
  };
}
