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
