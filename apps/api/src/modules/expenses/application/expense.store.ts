import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type ExpenseStatus = 'active' | 'voided';
export type ExpenseListStatusFilter = ExpenseStatus | 'all';
export type ExpensePaymentMethod =
  'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit_card' | 'check' | 'other';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ExpenseRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly branchName: string | null;
  readonly categoryId: string;
  readonly categoryName: string | null;
  readonly expenseDate: string;
  readonly amount: string;
  readonly paymentMethod: ExpensePaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string;
  readonly status: ExpenseStatus;
  readonly voidReason: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly lockVersion: number;
}

export interface ExpenseReferenceRecord {
  readonly branchId: string;
  readonly branchStatus: 'active' | 'inactive';
  readonly categoryId: string;
  readonly categoryStatus: 'active' | 'inactive';
}

export interface ExpenseListCursor {
  readonly expenseDate: string;
  readonly id: string;
}

export interface ListExpensesInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly categoryId: string | null;
  readonly status: ExpenseListStatusFilter;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly limit: number;
  readonly cursor: ExpenseListCursor | null;
}

export interface CreateExpenseInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: string;
  readonly paymentMethod: ExpensePaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateExpenseInput extends Omit<
  CreateExpenseInput,
  'id' | 'createdByUserId' | 'createdAt'
> {
  readonly expenseId: string;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface VoidExpenseInput {
  readonly tenantId: string;
  readonly expenseId: string;
  readonly expectedLockVersion: number;
  readonly voidReason: string;
  readonly voidedByUserId: string;
  readonly voidedAt: Date;
}

export interface CreateExpenseStatusEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly expenseId: string;
  readonly fromStatus: ExpenseStatus | null;
  readonly toStatus: ExpenseStatus;
  readonly reason: string | null;
  readonly beforeJson: unknown;
  readonly afterJson: unknown;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export abstract class ExpenseStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listExpenses(
    input: ListExpensesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly ExpenseRecord[]>;

  abstract findExpenseById(
    tenantId: string,
    expenseId: string,
    client?: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null>;

  abstract lockExpenseById(
    tenantId: string,
    expenseId: string,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null>;

  abstract findExpenseReference(
    tenantId: string,
    branchId: string,
    categoryId: string,
    client: DatabaseQueryClient,
  ): Promise<ExpenseReferenceRecord | null>;

  abstract createExpense(
    input: CreateExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord>;

  abstract updateExpense(
    input: UpdateExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null>;

  abstract voidExpense(
    input: VoidExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null>;

  abstract createExpenseStatusEvent(
    input: CreateExpenseStatusEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;
}
