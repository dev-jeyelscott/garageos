import type { AccountsPayableFilters } from './accounts-payable.types';

export const accountsPayablePageSize = 25;

export const defaultAccountsPayableFilters: AccountsPayableFilters = {
  branch_id: null,
  supplier_id: null,
  include_zero: false,
};
