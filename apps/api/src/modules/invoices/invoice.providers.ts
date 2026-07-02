import { InvoiceStore } from './application/invoice.store';
import { PostgresInvoiceStore } from './persistence/postgres-invoice.store';

export const INVOICE_PROVIDERS = [
  {
    provide: InvoiceStore,
    useClass: PostgresInvoiceStore,
  },
] as const;
