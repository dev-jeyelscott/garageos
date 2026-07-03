import type { InvoiceListFilters, InvoiceStatusFilter } from './invoice.types';

export const invoiceListPageSize = 50;

export const defaultInvoiceListFilters: InvoiceListFilters = {
  status: 'all',
  branch_id: 'all',
  customer_id: '',
  from_date: '',
  to_date: '',
};

export const invoiceStatusFilterOptions: readonly {
  readonly value: InvoiceStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'voided', label: 'Voided' },
  { value: 'refunded', label: 'Refunded' },
];
