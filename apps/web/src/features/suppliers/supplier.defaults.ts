import type {
  SupplierFormValues,
  SupplierListFilters,
  SupplierPaymentFormValues,
  SupplierPaymentMethod,
  SupplierStatusFilter,
} from './supplier.types';

export const supplierListPageSize = 25;

export const defaultSupplierListFilters: SupplierListFilters = {
  q: '',
  status: 'all',
};

export const defaultSupplierFormValues: SupplierFormValues = {
  name: '',
  contact_person: '',
  mobile_number: '',
  email: '',
  address: '',
  notes: '',
};

export const defaultSupplierPaymentFormValues: SupplierPaymentFormValues = {
  amount: '',
  payment_date: toDateInputValue(new Date()),
  payment_method: 'cash',
  reference_number: '',
  notes: '',
};

export const supplierStatusFilterOptions: readonly {
  readonly value: SupplierStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All suppliers' },
  { value: 'active', label: 'Active suppliers' },
  { value: 'inactive', label: 'Inactive suppliers' },
];

export const supplierPaymentMethodOptions: readonly {
  readonly value: SupplierPaymentMethod;
  readonly label: string;
}[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

function toDateInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}
