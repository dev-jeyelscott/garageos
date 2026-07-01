import type { ApiPaginationMeta } from '../../lib/api-envelope';

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export type PurchaseOrderStatusFilter = 'all' | PurchaseOrderStatus;

export type PurchasePaymentTerms = 'cash' | 'credit';

export type PurchaseOrderBranchFilter = 'all' | string;

export interface PurchaseOrderListFilters {
  readonly q: string;
  readonly status: PurchaseOrderStatusFilter;
  readonly branch_id: PurchaseOrderBranchFilter;
  readonly from_date: string;
  readonly to_date: string;
}

export interface PurchaseOrderListItem {
  readonly id: string;
  readonly purchase_order_number: string;
  readonly status: PurchaseOrderStatus;
  readonly payment_terms: PurchasePaymentTerms;
  readonly branch_id: string | null;
  readonly branch_name: string | null;
  readonly supplier_id: string | null;
  readonly supplier_name: string | null;
  readonly order_date: string;
  readonly expected_receive_date: string | null;
  readonly ordered_total_amount: string | null;
  readonly received_total_amount: string | null;
  readonly ordered_line_count: number | null;
  readonly received_line_count: number | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

export interface PurchaseOrderLineItem {
  readonly id: string;
  readonly product_id: string | null;
  readonly product_name: string | null;
  readonly ordered_quantity: string | null;
  readonly received_quantity: string | null;
  readonly unit_cost: string | null;
  readonly line_total: string | null;
  readonly notes: string | null;
}

export interface PurchaseOrderSummaryField {
  readonly label: string;
  readonly value: string | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderListItem {
  readonly lock_version: number;
  readonly line_items: readonly PurchaseOrderLineItem[];
  readonly receiving_status_summary: readonly PurchaseOrderSummaryField[];
}

export interface PurchaseOrderListResult {
  readonly purchaseOrders: readonly PurchaseOrderListItem[];
  readonly pagination: ApiPaginationMeta | null;
}

export type PurchaseOrderListState =
  | {
      readonly status: 'idle' | 'loading';
      readonly purchaseOrders: readonly PurchaseOrderListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'loaded' | 'loading_more';
      readonly purchaseOrders: readonly PurchaseOrderListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'error';
      readonly purchaseOrders: readonly PurchaseOrderListItem[];
      readonly pagination: ApiPaginationMeta | null;
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export type PurchaseOrderDetailState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'loaded'; readonly purchaseOrder: PurchaseOrderDetail }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };
