import { ExpenseStore } from './application/expense.store';
import { PostgresExpenseRepository } from './persistence/postgres-expense.repository';

export const EXPENSE_PROVIDERS = [
  {
    provide: ExpenseStore,
    useClass: PostgresExpenseRepository,
  },
] as const;
