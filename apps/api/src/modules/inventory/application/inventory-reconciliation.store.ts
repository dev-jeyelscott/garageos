import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export const INVENTORY_RECONCILIATION_ISSUE_CODES = {
  STOCK_BALANCE_LEDGER_ON_HAND_MISMATCH: 'stock_balance_ledger_on_hand_mismatch',
  STOCK_BALANCE_LEDGER_RESERVED_MISMATCH: 'stock_balance_ledger_reserved_mismatch',
  STOCK_BALANCE_ACTIVE_RESERVATION_MISMATCH: 'stock_balance_active_reservation_mismatch',
  STOCK_BALANCE_FIFO_REMAINING_MISMATCH: 'stock_balance_fifo_remaining_mismatch',
  ACTIVE_RESERVATION_FIFO_ALLOCATION_MISMATCH: 'active_reservation_fifo_allocation_mismatch',
  FIFO_LAYER_ACTIVE_ALLOCATION_EXCEEDS_REMAINING: 'fifo_layer_active_allocation_exceeds_remaining',
  FIFO_LAYER_REMAINING_OUT_OF_BOUNDS: 'fifo_layer_remaining_out_of_bounds',
  FIFO_ALLOCATION_ACTIVE_REFERENCE_CONFLICT: 'fifo_allocation_active_reference_conflict',
} as const;

export const INVENTORY_RECONCILIATION_ISSUE_CODE_VALUES = Object.values(
  INVENTORY_RECONCILIATION_ISSUE_CODES,
);

export type InventoryReconciliationIssueCode =
  (typeof INVENTORY_RECONCILIATION_ISSUE_CODES)[keyof typeof INVENTORY_RECONCILIATION_ISSUE_CODES];

export const INVENTORY_RECONCILIATION_ISSUE_SEVERITIES = {
  CRITICAL: 'critical',
  WARNING: 'warning',
} as const;

export const INVENTORY_RECONCILIATION_ISSUE_SEVERITY_VALUES = Object.values(
  INVENTORY_RECONCILIATION_ISSUE_SEVERITIES,
);

export type InventoryReconciliationIssueSeverity =
  (typeof INVENTORY_RECONCILIATION_ISSUE_SEVERITIES)[keyof typeof INVENTORY_RECONCILIATION_ISSUE_SEVERITIES];

export const INVENTORY_RECONCILIATION_REFERENCE_TYPES = {
  STOCK_BALANCE: 'stock_balance',
  INVENTORY_RESERVATION: 'inventory_reservation',
  FIFO_LAYER: 'fifo_layer',
  FIFO_RESERVATION_ALLOCATION: 'fifo_reservation_allocation',
} as const;

export const INVENTORY_RECONCILIATION_REFERENCE_TYPE_VALUES = Object.values(
  INVENTORY_RECONCILIATION_REFERENCE_TYPES,
);

export type InventoryReconciliationReferenceType =
  (typeof INVENTORY_RECONCILIATION_REFERENCE_TYPES)[keyof typeof INVENTORY_RECONCILIATION_REFERENCE_TYPES];

export interface CheckInventoryReconciliationInput {
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly productId: string | null;
}

export interface InventoryReconciliationIssueRecord {
  readonly issueCode: InventoryReconciliationIssueCode;
  readonly severity: InventoryReconciliationIssueSeverity;
  readonly referenceType: InventoryReconciliationReferenceType;
  readonly referenceId: string | null;
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly productId: string | null;
  readonly expectedQuantity: string | null;
  readonly actualQuantity: string | null;
  readonly differenceQuantity: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export abstract class InventoryReconciliationStore {
  abstract listReconciliationIssues(
    input: CheckInventoryReconciliationInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryReconciliationIssueRecord[]>;
}
