import { AccountsPayableStore } from './application/accounts-payable.store';
import { PostgresAccountsPayableRepository } from './persistence/postgres-accounts-payable.repository';

export const ACCOUNTS_PROVIDERS = [
  {
    provide: AccountsPayableStore,
    useClass: PostgresAccountsPayableRepository,
  },
] as const;
