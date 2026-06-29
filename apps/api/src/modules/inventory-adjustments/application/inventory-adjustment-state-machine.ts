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
