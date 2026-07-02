import type { ApiPaginationMeta } from '../../lib/api-envelope';

export type AccountsPayableReportScope = 'tenant' | 'branch_source';
export type AccountsPayableSupplierStatus = 'active' | 'inactive';

export interface AccountsPayableFilters {
  readonly branch_id: string | null;
  readonly supplier_id: string | null;
  readonly include_zero: boolean;
}

export interface AccountsPayableTotals {
  readonly credit_purchase_received_total: string;
  readonly supplier_payment_total: string;
  readonly supplier_credit_total: string;
  readonly payable_balance: string;
}

export interface AccountsPayableSupplierBalance extends AccountsPayableTotals {
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly supplier_status: AccountsPayableSupplierStatus;
  readonly last_activity_at: string;
}

export interface AccountsPayableBranchBalance {
  readonly branch_id: string;
  readonly branch_name: string;
  readonly branch_status: AccountsPayableSupplierStatus;
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly credit_purchase_received_total: string;
  readonly supplier_credit_total: string;
  readonly source_balance: string;
  readonly last_activity_at: string;
}

export interface AccountsPayableListResult {
  readonly scope: AccountsPayableReportScope;
  readonly branch_ids: readonly string[] | null;
  readonly balances: readonly AccountsPayableSupplierBalance[];
  readonly pagination: ApiPaginationMeta;
}

export interface AccountsPayableSummaryResult {
  readonly scope: AccountsPayableReportScope;
  readonly branch_ids: readonly string[] | null;
  readonly totals: AccountsPayableTotals;
  readonly by_supplier: readonly AccountsPayableSupplierBalance[];
  readonly by_branch: readonly AccountsPayableBranchBalance[];
}
