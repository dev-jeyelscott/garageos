export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
} as const;

export const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUSES);

export type InvoiceStatus = (typeof INVOICE_STATUSES)[keyof typeof INVOICE_STATUSES];

export const INVOICE_LINE_TYPES = {
  SERVICE: 'service',
  LABOR: 'labor',
  PART: 'part',
  CUSTOM: 'custom',
} as const;

export const INVOICE_LINE_TYPE_VALUES = Object.values(INVOICE_LINE_TYPES);

export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[keyof typeof INVOICE_LINE_TYPES];

export const BILLING_ALLOCATION_STATUSES = {
  RESERVED: 'reserved',
  FINAL: 'final',
  RELEASED: 'released',
  CLOSED: 'closed',
} as const;

export const BILLING_ALLOCATION_STATUS_VALUES = Object.values(BILLING_ALLOCATION_STATUSES);

export type BillingAllocationStatus =
  (typeof BILLING_ALLOCATION_STATUSES)[keyof typeof BILLING_ALLOCATION_STATUSES];

export const TAX_PROFILES = {
  VAT_REGISTERED: 'vat_registered',
  NON_VAT: 'non_vat',
  NO_TAX: 'no_tax',
} as const;

export const TAX_PROFILE_VALUES = Object.values(TAX_PROFILES);

export type TaxProfile = (typeof TAX_PROFILES)[keyof typeof TAX_PROFILES];

export const TAX_MODES = {
  TAX_INCLUSIVE: 'tax_inclusive',
  TAX_EXCLUSIVE: 'tax_exclusive',
  NO_TAX: 'no_tax',
} as const;

export const TAX_MODE_VALUES = Object.values(TAX_MODES);

export type TaxMode = (typeof TAX_MODES)[keyof typeof TAX_MODES];

export const PAYMENT_METHODS = {
  CASH: 'cash',
  GCASH: 'gcash',
  MAYA: 'maya',
  BANK_TRANSFER: 'bank_transfer',
  CREDIT_CARD: 'credit_card',
  CHECK: 'check',
  OTHER: 'other',
} as const;

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHODS);

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export interface InvoiceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: Date;
  readonly dueDate: Date | null;
  readonly status: InvoiceStatus;
  readonly taxProfile: TaxProfile | null;
  readonly taxMode: TaxMode | null;
  readonly vatRate: string | null;
  readonly subtotalAmount: string;
  readonly discountAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly amountPaid: string;
  readonly amountRefunded: string;
  readonly remainingCollectibleBalance: string;
  readonly discountReason: string | null;
  readonly issuedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly voidedAt: Date | null;
  readonly refundedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface InvoiceJobOrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly jobOrderId: string;
  readonly createdAt: Date;
}

export interface InvoiceLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly originatingJobOrderLineId: string | null;
  readonly lineType: InvoiceLineType;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineDiscountAmount: string;
  readonly allocatedInvoiceDiscountAmount: string;
  readonly taxableBaseAmount: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

export interface InvoiceBillingAllocationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly invoiceLineId: string;
  readonly jobOrderLineId: string;
  readonly allocatedQuantity: string | null;
  readonly allocatedAmount: string | null;
  readonly status: BillingAllocationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InvoiceStatusEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly fromStatus: InvoiceStatus | null;
  readonly toStatus: InvoiceStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface InvoicePaymentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly amount: string;
  readonly refundableAmount: string;
  readonly paymentDate: Date;
  readonly paymentMethod: PaymentMethod;
  readonly referenceNumber: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export interface InvoiceReceiptRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly paymentId: string;
  readonly receiptNumber: string;
  readonly amount: string;
  readonly paymentMethod: PaymentMethod;
  readonly issuedAt: Date;
  readonly createdByUserId: string | null;
}

export interface InvoiceWithDetailsRecord {
  readonly invoice: InvoiceRecord;
  readonly jobOrders: readonly InvoiceJobOrderRecord[];
  readonly lines: readonly InvoiceLineRecord[];
  readonly billingAllocations: readonly InvoiceBillingAllocationRecord[];
}
