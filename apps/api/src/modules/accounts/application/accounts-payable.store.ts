import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type AccountsPayableReportScope = 'tenant' | 'branch_source';
export type AccountsPayableSupplierStatus = 'active' | 'inactive';
export type AccountsPayableBranchStatus = 'active' | 'inactive';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface AccountsPayableListCursor {
  readonly lastActivityAt: Date;
  readonly supplierId: string;
}

export interface AccountsPayableScopeInput {
  readonly tenantId: string;
  readonly reportScope: AccountsPayableReportScope;
  readonly branchIds: readonly string[] | null;
}

export interface ListAccountsPayableInput extends AccountsPayableScopeInput {
  readonly supplierId: string | null;
  readonly includeZero: boolean;
  readonly limit: number;
  readonly cursor: AccountsPayableListCursor | null;
}

export interface GetAccountsPayableSummaryInput extends AccountsPayableScopeInput {
  readonly supplierId: string | null;
  readonly includeZero: boolean;
}

export interface AccountsPayableSupplierBasisRecord {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly supplierStatus: AccountsPayableSupplierStatus;
  readonly creditPurchaseReceivedTotal: string;
  readonly supplierPaymentTotal: string;
  readonly supplierCreditTotal: string;
  readonly lastActivityAt: Date;
}

export interface AccountsPayableBranchBasisRecord {
  readonly branchId: string;
  readonly branchName: string;
  readonly branchStatus: AccountsPayableBranchStatus;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly creditPurchaseReceivedTotal: string;
  readonly supplierCreditTotal: string;
  readonly lastActivityAt: Date;
}

export interface AccountsPayableSummaryBasisRecord {
  readonly suppliers: readonly AccountsPayableSupplierBasisRecord[];
  readonly branches: readonly AccountsPayableBranchBasisRecord[];
}

export abstract class AccountsPayableStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listSupplierBalances(
    input: ListAccountsPayableInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly AccountsPayableSupplierBasisRecord[]>;

  abstract getSummaryBasis(
    input: GetAccountsPayableSummaryInput,
    client?: DatabaseQueryClient,
  ): Promise<AccountsPayableSummaryBasisRecord>;
}
