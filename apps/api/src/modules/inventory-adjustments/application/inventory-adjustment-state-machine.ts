import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentStatus,
} from './inventory-adjustment.records';

export function assertCanSubmitForApproval(adjustment: InventoryAdjustmentRecord): void {
  assertCurrentStatus(adjustment.status, INVENTORY_ADJUSTMENT_STATUSES.DRAFT, 'submit');

  if (!adjustment.approvalRequired) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Submitting without approval is deferred to the posting workflow.',
      [
        {
          field: 'approval_required',
          code: 'approval_not_required',
          message: 'This adjustment does not require approval.',
        },
      ],
    );
  }
}

export function assertCanApprove(adjustment: InventoryAdjustmentRecord): void {
  assertCurrentStatus(adjustment.status, INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL, 'approve');
}

export function assertCanReject(
  adjustment: InventoryAdjustmentRecord,
  rejectionReason: string,
): void {
  assertCurrentStatus(adjustment.status, INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL, 'reject');

  if (rejectionReason.trim().length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: 'required',
        message: 'Rejection reason is required.',
      },
    ]);
  }
}

export function assertCanCancel(
  adjustment: InventoryAdjustmentRecord,
  cancellationReason: string,
): void {
  if (
    adjustment.status !== INVENTORY_ADJUSTMENT_STATUSES.DRAFT &&
    adjustment.status !== INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL
  ) {
    throw GarageOsApiException.workflowTransitionBlocked(
      `Inventory adjustment cannot cancel from ${adjustment.status}.`,
      [
        {
          field: 'status',
          code: 'invalid_status',
          message: 'Expected draft or pending_approval status.',
        },
      ],
    );
  }

  if (cancellationReason.trim().length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: 'required',
        message: 'Cancellation reason is required.',
      },
    ]);
  }
}

export function assertCanPost(adjustment: InventoryAdjustmentRecord): void {
  if (
    adjustment.status === INVENTORY_ADJUSTMENT_STATUSES.APPROVED ||
    (adjustment.status === INVENTORY_ADJUSTMENT_STATUSES.DRAFT && !adjustment.approvalRequired)
  ) {
    return;
  }

  const expectedStatus = adjustment.approvalRequired
    ? INVENTORY_ADJUSTMENT_STATUSES.APPROVED
    : `${INVENTORY_ADJUSTMENT_STATUSES.DRAFT} without approval or ${INVENTORY_ADJUSTMENT_STATUSES.APPROVED}`;

  throw GarageOsApiException.workflowTransitionBlocked(
    `Inventory adjustment cannot post from ${adjustment.status}.`,
    [
      {
        field: 'status',
        code: 'invalid_status',
        message: `Expected ${expectedStatus} status.`,
      },
    ],
  );
}

function assertCurrentStatus(
  currentStatus: InventoryAdjustmentStatus,
  expectedStatus: InventoryAdjustmentStatus,
  action: string,
): void {
  if (currentStatus === expectedStatus) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    `Inventory adjustment cannot ${action} from ${currentStatus}.`,
    [
      {
        field: 'status',
        code: 'invalid_status',
        message: `Expected ${expectedStatus} status.`,
      },
    ],
  );
}
