import type { DatabaseRow } from '../../../shared/database/database-client';
import {
  BILLING_ALLOCATION_STATUS_VALUES,
  INVOICE_LINE_TYPE_VALUES,
  INVOICE_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  TAX_MODE_VALUES,
  TAX_PROFILE_VALUES,
  type BillingAllocationStatus,
  type InvoiceBillingAllocationRecord,
  type InvoiceJobOrderRecord,
  type InvoiceLineRecord,
  type InvoiceLineType,
  type InvoicePaymentRecord,
  type InvoiceReceiptRecord,
  type InvoiceRecord,
  type InvoiceStatus,
  type InvoiceStatusEventRecord,
  type PaymentMethod,
  type TaxMode,
  type TaxProfile,
} from './invoice.records';

export interface InvoiceRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly invoice_number: string;
  readonly invoice_date: Date | string;
  readonly due_date: Date | string | null;
  readonly status: string;
  readonly tax_profile: string | null;
  readonly tax_mode: string | null;
  readonly vat_rate: string | null;
  readonly subtotal_amount: string;
  readonly discount_amount: string;
  readonly tax_amount: string;
  readonly total_amount: string;
  readonly amount_paid: string;
  readonly amount_refunded: string;
  readonly remaining_collectible_balance: string;
  readonly discount_reason: string | null;
  readonly issued_at: Date | string | null;
  readonly cancelled_at: Date | string | null;
  readonly voided_at: Date | string | null;
  readonly refunded_at: Date | string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

export interface InvoiceJobOrderRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly job_order_id: string;
  readonly created_at: Date | string;
}

export interface InvoiceLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly originating_job_order_line_id: string | null;
  readonly line_type: string;
  readonly product_id: string | null;
  readonly service_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly line_discount_amount: string;
  readonly allocated_invoice_discount_amount: string;
  readonly taxable_base_amount: string;
  readonly tax_amount: string;
  readonly line_total: string;
  readonly line_order: number;
}

export interface InvoiceBillingAllocationRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly invoice_line_id: string;
  readonly job_order_line_id: string;
  readonly allocated_quantity: string | null;
  readonly allocated_amount: string | null;
  readonly status: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export interface InvoiceStatusEventRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly reason: string | null;
  readonly created_by_user_id: string;
  readonly created_at: Date | string;
}

export interface InvoicePaymentRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly amount: string;
  readonly refundable_amount: string;
  readonly payment_date: Date | string;
  readonly payment_method: string;
  readonly reference_number: string | null;
  readonly notes: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
}

export interface InvoiceReceiptRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly invoice_id: string;
  readonly payment_id: string;
  readonly receipt_number: string;
  readonly amount: string;
  readonly payment_method: string;
  readonly issued_at: Date | string;
  readonly created_by_user_id: string | null;
}

export function mapInvoiceRow(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: toDate(row.invoice_date),
    dueDate: toNullableDate(row.due_date),
    status: mapInvoiceStatus(row.status),
    taxProfile: row.tax_profile === null ? null : mapTaxProfile(row.tax_profile),
    taxMode: row.tax_mode === null ? null : mapTaxMode(row.tax_mode),
    vatRate: row.vat_rate,
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    amountPaid: row.amount_paid,
    amountRefunded: row.amount_refunded,
    remainingCollectibleBalance: row.remaining_collectible_balance,
    discountReason: row.discount_reason,
    issuedAt: toNullableDate(row.issued_at),
    cancelledAt: toNullableDate(row.cancelled_at),
    voidedAt: toNullableDate(row.voided_at),
    refundedAt: toNullableDate(row.refunded_at),
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

export function mapInvoiceJobOrderRow(row: InvoiceJobOrderRow): InvoiceJobOrderRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    jobOrderId: row.job_order_id,
    createdAt: toDate(row.created_at),
  };
}

export function mapInvoiceLineRow(row: InvoiceLineRow): InvoiceLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    originatingJobOrderLineId: row.originating_job_order_line_id,
    lineType: mapInvoiceLineType(row.line_type),
    productId: row.product_id,
    serviceId: row.service_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineDiscountAmount: row.line_discount_amount,
    allocatedInvoiceDiscountAmount: row.allocated_invoice_discount_amount,
    taxableBaseAmount: row.taxable_base_amount,
    taxAmount: row.tax_amount,
    lineTotal: row.line_total,
    lineOrder: row.line_order,
  };
}

export function mapInvoiceBillingAllocationRow(
  row: InvoiceBillingAllocationRow,
): InvoiceBillingAllocationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    invoiceLineId: row.invoice_line_id,
    jobOrderLineId: row.job_order_line_id,
    allocatedQuantity: row.allocated_quantity,
    allocatedAmount: row.allocated_amount,
    status: mapBillingAllocationStatus(row.status),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapInvoiceStatusEventRow(row: InvoiceStatusEventRow): InvoiceStatusEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    fromStatus: row.from_status === null ? null : mapInvoiceStatus(row.from_status),
    toStatus: mapInvoiceStatus(row.to_status),
    reason: row.reason,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

export function mapInvoicePaymentRow(row: InvoicePaymentRow): InvoicePaymentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    amount: row.amount,
    refundableAmount: row.refundable_amount,
    paymentDate: toDate(row.payment_date),
    paymentMethod: mapPaymentMethod(row.payment_method),
    referenceNumber: row.reference_number,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

export function mapInvoiceReceiptRow(row: InvoiceReceiptRow): InvoiceReceiptRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    receiptNumber: row.receipt_number,
    amount: row.amount,
    paymentMethod: mapPaymentMethod(row.payment_method),
    issuedAt: toDate(row.issued_at),
    createdByUserId: row.created_by_user_id,
  };
}

function mapInvoiceStatus(status: string): InvoiceStatus {
  if ((INVOICE_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as InvoiceStatus;
  }

  throw new Error(`Unknown invoice status: ${status}.`);
}

function mapInvoiceLineType(lineType: string): InvoiceLineType {
  if ((INVOICE_LINE_TYPE_VALUES as readonly string[]).includes(lineType)) {
    return lineType as InvoiceLineType;
  }

  throw new Error(`Unknown invoice line type: ${lineType}.`);
}

function mapBillingAllocationStatus(status: string): BillingAllocationStatus {
  if ((BILLING_ALLOCATION_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as BillingAllocationStatus;
  }

  throw new Error(`Unknown billing allocation status: ${status}.`);
}

function mapTaxProfile(taxProfile: string): TaxProfile {
  if ((TAX_PROFILE_VALUES as readonly string[]).includes(taxProfile)) {
    return taxProfile as TaxProfile;
  }

  throw new Error(`Unknown invoice tax profile: ${taxProfile}.`);
}

function mapTaxMode(taxMode: string): TaxMode {
  if ((TAX_MODE_VALUES as readonly string[]).includes(taxMode)) {
    return taxMode as TaxMode;
  }

  throw new Error(`Unknown invoice tax mode: ${taxMode}.`);
}

function mapPaymentMethod(paymentMethod: string): PaymentMethod {
  if ((PAYMENT_METHOD_VALUES as readonly string[]).includes(paymentMethod)) {
    return paymentMethod as PaymentMethod;
  }

  throw new Error(`Unknown invoice payment method: ${paymentMethod}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}
