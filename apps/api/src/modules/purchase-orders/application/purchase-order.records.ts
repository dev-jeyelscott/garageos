export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  ORDERED: 'ordered',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export type PurchaseOrderStatus =
  (typeof PURCHASE_ORDER_STATUSES)[keyof typeof PURCHASE_ORDER_STATUSES];

export const PURCHASE_PAYMENT_TERMS = {
  CASH: 'cash',
  CREDIT: 'credit',
} as const;

export type PurchasePaymentTerms =
  (typeof PURCHASE_PAYMENT_TERMS)[keyof typeof PURCHASE_PAYMENT_TERMS];

export type PurchaseOrderBranchStatus = 'active' | 'inactive';
export type PurchaseOrderSupplierStatus = 'active' | 'inactive';

export interface PurchaseOrderForReceivingRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly supplierId: string;
  readonly purchaseOrderNumber: string;
  readonly status: PurchaseOrderStatus;
  readonly paymentTerms: PurchasePaymentTerms;
  readonly branchStatus: PurchaseOrderBranchStatus;
  readonly supplierStatus: PurchaseOrderSupplierStatus;
}

export interface PurchaseOrderLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly purchaseOrderId: string;
  readonly productId: string;
  readonly orderedQuantity: string;
  readonly receivedQuantity: string;
  readonly unitCost: string;
}

export interface PurchaseReceivingRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly purchaseOrderId: string;
  readonly supplierId: string;
  readonly receivedAt: Date;
  readonly receivedByUserId: string;
  readonly paymentMethod: string | null;
  readonly paymentReference: string | null;
  readonly postedAt: Date;
}

export interface PurchaseReceivingLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly receivingId: string;
  readonly purchaseOrderLineId: string;
  readonly productId: string;
  readonly receivedQuantity: string;
  readonly receivedUnitCost: string;
  readonly fifoLayerId: string | null;
}

export interface SupplierPayableRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly branchId: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly amountDelta: string;
  readonly occurredAt: Date;
}
