import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type ExpenseCategoryStatus = 'active' | 'inactive';

export type ExpenseCategoryListStatusFilter = ExpenseCategoryStatus | 'all';

export type ExpenseCategoryDeactivationBlocker = 'active_expenses';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ExpenseCategoryRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly status: ExpenseCategoryStatus;
  readonly createdAt: Date;
  readonly createdByUserId: string | null;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
  readonly lockVersion: number;
}

export interface ListExpenseCategoriesInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly status: ExpenseCategoryListStatusFilter;
  readonly limit: number;
}

export interface CreateExpenseCategoryInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateExpenseCategoryInput {
  readonly tenantId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ChangeExpenseCategoryStatusInput {
  readonly tenantId: string;
  readonly categoryId: string;
  readonly fromStatus: ExpenseCategoryStatus;
  readonly toStatus: ExpenseCategoryStatus;
  readonly expectedLockVersion: number;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export abstract class ExpenseCategoryStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listExpenseCategories(
    input: ListExpenseCategoriesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly ExpenseCategoryRecord[]>;

  abstract findExpenseCategoryById(
    tenantId: string,
    categoryId: string,
    client?: DatabaseQueryClient,
  ): Promise<ExpenseCategoryRecord | null>;

  abstract createExpenseCategory(
    input: CreateExpenseCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseCategoryRecord>;

  abstract updateExpenseCategory(
    input: UpdateExpenseCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseCategoryRecord | null>;

  abstract changeExpenseCategoryStatus(
    input: ChangeExpenseCategoryStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseCategoryRecord | null>;

  abstract findExpenseCategoryDeactivationBlockers(
    tenantId: string,
    categoryId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly ExpenseCategoryDeactivationBlocker[]>;
}
