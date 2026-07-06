import { ExpenseCategoryStore } from './application/expense-category.store';
import { PostgresExpenseCategoryRepository } from './persistence/postgres-expense-category.repository';

export const EXPENSE_CATEGORY_PROVIDERS = [
  {
    provide: ExpenseCategoryStore,
    useClass: PostgresExpenseCategoryRepository,
  },
] as const;
