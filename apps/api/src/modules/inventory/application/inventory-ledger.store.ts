import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export const INVENTORY_TRANSACTION_TYPES = {
  PURCHASE_RECEIVE: 'purchase_receive',
  JOB_ORDER_RESERVATION: 'job_order_reservation',
  RESERVATION_RELEASE: 'reservation_release',
  JOB_ORDER_CONSUMPTION: 'job_order_consumption',
  INVENTORY_ADJUSTMENT_INCREASE: 'inventory_adjustment_increase',
  INVENTORY_ADJUSTMENT_DECREASE: 'inventory_adjustment_decrease',
  INVENTORY_TRANSFER_RESERVATION: 'inventory_transfer_reservation',
  INVENTORY_TRANSFER_RESERVATION_RELEASE: 'inventory_transfer_reservation_release',
  INVENTORY_TRANSFER_OUT: 'inventory_transfer_out',
  INVENTORY_TRANSFER_IN: 'inventory_transfer_in',
  INVENTORY_TRANSFER_VARIANCE_LOSS: 'inventory_transfer_variance_loss',
  SUPPLIER_RETURN: 'supplier_return',
  REFUND_INVENTORY_REVERSAL: 'refund_inventory_reversal',
  VOID_INVENTORY_REVERSAL: 'void_inventory_reversal',
} as const;

export const INVENTORY_TRANSACTION_TYPE_VALUES = Object.values(INVENTORY_TRANSACTION_TYPES);

export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPES)[keyof typeof INVENTORY_TRANSACTION_TYPES];

export interface CreateInventoryLedgerEntryInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly transactionType: InventoryTransactionType;
  readonly quantityDeltaOnHand: string;
  readonly quantityDeltaReserved: string;
  readonly unitCost: string | null;
  readonly totalCost: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly occurredAt: Date;
  readonly createdByUserId: string | null;
}

export interface InventoryLedgerEntryRecord extends CreateInventoryLedgerEntryInput {}

export abstract class InventoryLedgerStore {
  abstract createLedgerEntry(
    input: CreateInventoryLedgerEntryInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryLedgerEntryRecord>;
}
