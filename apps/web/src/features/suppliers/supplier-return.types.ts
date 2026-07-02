import type { ApiPaginationMeta } from '../../lib/api-envelope';

export type SupplierReturnStatus = 'draft' | 'posted' | 'cancelled';
export type SupplierReturnStatusFilter = 'all' | SupplierReturnStatus;
export type SupplierReturnBranchFilter = 'all' | string;
export type SupplierReturnSupplierFilter = 'all' | string;

export interface SupplierReturnListFilters {
  readonly status: SupplierReturnStatusFilter;
  readonly branch_id: SupplierReturnBranchFilter;
  readonly supplier_id: SupplierReturnSupplierFilter;
}

export interface SupplierReturnListItem {
  readonly id: string;
  readonly supplier_return_number: string | null;
  readonly status: SupplierReturnStatus;
  readonly branch_id: string | null;
  readonly branch_name: string | null;
  readonly supplier_id: string | null;
  readonly supplier_name: string | null;
  readonly original_receiving_id: string | null;
  readonly reason: string | null;
  readonly total_returned_quantity: string | null;
  readonly inventory_value: string | null;
  readonly financial_value: string | null;
  readonly ap_reduction_amount: string | null;
  readonly supplier_credit_amount: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly posted_at: string | null;
  readonly cancelled_at: string | null;
}

export interface SupplierReturnLineItem {
  readonly id: string;
  readonly product_id: string | null;
  readonly product_name: string | null;
  readonly returned_quantity: string | null;
  readonly inventory_value: string | null;
  readonly financial_value: string | null;
}

export interface SupplierReturnDetail extends SupplierReturnListItem {
  readonly lock_version: number;
  readonly line_items: readonly SupplierReturnLineItem[];
}

export interface SupplierReturnFormLineValues {
  readonly client_id: string;
  readonly product_id: string;
  readonly returned_quantity: string;
}

export interface SupplierReturnFormValues {
  readonly branch_id: string;
  readonly supplier_id: string;
  readonly original_receiving_id: string;
  readonly reason: string;
  readonly lines: readonly SupplierReturnFormLineValues[];
}

export interface SupplierReturnLineInput {
  readonly product_id: string;
  readonly returned_quantity: string;
}

export interface SupplierReturnImmediateCashRefundInput {
  readonly enabled: false;
}

export interface SupplierReturnInput {
  readonly branch_id: string;
  readonly supplier_id: string;
  readonly original_receiving_id: string | null;
  readonly reason: string;
  readonly immediate_cash_refund: SupplierReturnImmediateCashRefundInput;
  readonly lines: readonly SupplierReturnLineInput[];
}

export interface SupplierReturnUpdateInput extends SupplierReturnInput {
  readonly lock_version: number;
}

export interface SupplierReturnListResult {
  readonly supplierReturns: readonly SupplierReturnListItem[];
  readonly pagination: ApiPaginationMeta | null;
}

export type SupplierReturnListState =
  | {
      readonly status: 'idle' | 'loading';
      readonly supplierReturns: readonly SupplierReturnListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'loaded' | 'loading_more';
      readonly supplierReturns: readonly SupplierReturnListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'error';
      readonly supplierReturns: readonly SupplierReturnListItem[];
      readonly pagination: ApiPaginationMeta | null;
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export type SupplierReturnDetailState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'loaded'; readonly supplierReturn: SupplierReturnDetail }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };
