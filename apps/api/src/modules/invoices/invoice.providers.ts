import { AccountsReceivableStore } from './application/accounts-receivable.store';
import { InvoiceStore } from './application/invoice.store';
import { PostgresAccountsReceivableStore } from './persistence/postgres-accounts-receivable.store';
import { PostgresInvoiceStore } from './persistence/postgres-invoice.store';

export const INVOICE_PROVIDERS = [
  {
    provide: InvoiceStore,
    useClass: PostgresInvoiceStore,
  },
  {
    provide: AccountsReceivableStore,
    useClass: PostgresAccountsReceivableStore,
  },
] as const;
