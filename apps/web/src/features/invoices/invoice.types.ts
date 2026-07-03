import type { ApiPaginationMeta } from '../../lib/api-envelope';

export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'voided'
  | 'refunded';

export type InvoiceStatusFilter = 'all' | InvoiceStatus;

export type InvoiceBranchFilter = 'all' | string;

export type InvoiceDiscountType = 'none' | 'fixed' | 'percentage';

export type InvoicePaymentMethod =
  | 'cash'
  | 'gcash'
  | 'maya'
  | 'bank_transfer'
  | 'credit_card'
  | 'check'
  | 'other';

export interface InvoiceListFilters {
  readonly status: InvoiceStatusFilter;
  readonly branch_id: InvoiceBranchFilter;
  readonly customer_id: string;
  readonly from_date: string;
  readonly to_date: string;
}

export interface InvoiceListItem {
  readonly id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly customer_id: string;
  readonly customer_name: string | null;
  readonly invoice_number: string;
  readonly invoice_date: string;
  readonly due_date: string | null;
  readonly status: InvoiceStatus;
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
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InvoiceLineItem {
  readonly id: string;
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

export interface InvoiceStatusEvent {
  readonly id: string;
  readonly invoice_id: string;
  readonly from_status: InvoiceStatus | null;
  readonly to_status: InvoiceStatus;
  readonly reason: string | null;
  readonly created_by_user_id: string;
  readonly created_at: string;
}

export interface InvoicePayment {
  readonly id: string;
  readonly invoice_id: string;
  readonly amount: string;
  readonly refundable_amount: string;
  readonly payment_date: string;
  readonly payment_method: InvoicePaymentMethod;
  readonly reference_number: string | null;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface InvoiceReceipt {
  readonly id: string;
  readonly invoice_id: string;
  readonly payment_id: string;
  readonly receipt_number: string;
  readonly amount: string;
  readonly payment_method: InvoicePaymentMethod;
  readonly issued_at: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  readonly job_order_ids: readonly string[];
  readonly lines: readonly InvoiceLineItem[];
  readonly status_events: readonly InvoiceStatusEvent[];
  readonly receipts: readonly InvoiceReceipt[];
}

export interface InvoiceListResult {
  readonly invoices: readonly InvoiceListItem[];
  readonly pagination: ApiPaginationMeta | null;
}

export interface InvoiceLevelDiscountInput {
  readonly type: 'fixed' | 'percentage';
  readonly amount?: string;
  readonly percentage?: string;
  readonly reason: string;
}

export interface CreateDraftInvoiceInput {
  readonly job_order_ids: readonly string[];
  readonly job_order_line_ids?: readonly string[];
  readonly invoice_date?: string;
  readonly due_date?: string | null;
  readonly invoice_level_discount?: InvoiceLevelDiscountInput;
}

export interface InvoiceWorkflowReasonInput {
  readonly reason: string;
}

export interface CreateInvoicePaymentInput {
  readonly amount: string;
  readonly payment_date: string;
  readonly payment_method: InvoicePaymentMethod;
  readonly reference_number?: string;
  readonly notes?: string;
}

export interface InvoicePaymentMutationResult {
  readonly payment: InvoicePayment;
  readonly receipt: InvoiceReceipt;
  readonly invoice: InvoiceListItem;
}

export interface InvoiceInventoryReversalLineInput {
  readonly invoice_line_id: string;
  readonly product_id: string;
  readonly return_quantity: string;
}

export interface InvoiceInventoryReversalInput {
  readonly selected: boolean;
  readonly lines: readonly InvoiceInventoryReversalLineInput[];
}

export interface CreateInvoiceRefundInput {
  readonly amount: string;
  readonly reason: string;
  readonly collection_should_continue: boolean;
  readonly close_invoice_after_refund: boolean;
  readonly inventory_reversal?: InvoiceInventoryReversalInput;
}

export interface InvoiceRefund {
  readonly id: string;
  readonly invoice_id: string;
  readonly payment_id: string;
  readonly amount: string;
  readonly reason: string;
  readonly collection_should_continue: boolean;
  readonly close_invoice_after_refund: boolean;
  readonly inventory_reversal_selected: boolean;
  readonly status: 'posted' | 'voided';
  readonly created_at: string;
}

export interface InvoiceInventoryReversal {
  readonly id: string;
  readonly job_order_line_id: string;
  readonly product_id: string;
  readonly quantity_returned: string;
  readonly inventory_ledger_entry_id: string;
  readonly fifo_layer_id: string;
  readonly created_at: string;
}

export interface InvoiceRefundMutationResult {
  readonly refund: InvoiceRefund;
  readonly payment: InvoicePayment;
  readonly invoice: InvoiceListItem;
  readonly inventory_reversals: readonly InvoiceInventoryReversal[];
}

export type InvoiceListState =
  | {
      readonly status: 'idle' | 'loading';
      readonly invoices: readonly InvoiceListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'loaded';
      readonly invoices: readonly InvoiceListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'error';
      readonly invoices: readonly InvoiceListItem[];
      readonly pagination: ApiPaginationMeta | null;
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export type InvoiceDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly invoice: InvoiceDetail }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };
