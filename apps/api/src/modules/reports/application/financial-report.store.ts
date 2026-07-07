import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type FinancialReportScope = 'tenant' | 'branch';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface FinancialReportExpenseBasisInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly fromDate: string | null;
  readonly toDate: string | null;
}

export interface FinancialReportExpenseTotalsRecord {
  readonly expenseCount: number;
  readonly totalAmount: string;
}

export interface FinancialReportExpenseCategoryRecord {
  readonly categoryId: string;
  readonly categoryName: string | null;
  readonly expenseCount: number;
  readonly totalAmount: string;
}

export interface FinancialReportExpenseBranchRecord {
  readonly branchId: string;
  readonly branchName: string | null;
  readonly expenseCount: number;
  readonly totalAmount: string;
}

export interface FinancialReportExpensePaymentMethodRecord {
  readonly paymentMethod: string;
  readonly expenseCount: number;
  readonly totalAmount: string;
}

export interface FinancialReportExpenseBasisRecord {
  readonly totals: FinancialReportExpenseTotalsRecord;
  readonly byCategory: readonly FinancialReportExpenseCategoryRecord[];
  readonly byBranch: readonly FinancialReportExpenseBranchRecord[];
  readonly byPaymentMethod: readonly FinancialReportExpensePaymentMethodRecord[];
}

export abstract class FinancialReportStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract getExpenseBasis(
    input: FinancialReportExpenseBasisInput,
    client?: DatabaseQueryClient,
  ): Promise<FinancialReportExpenseBasisRecord>;
}
