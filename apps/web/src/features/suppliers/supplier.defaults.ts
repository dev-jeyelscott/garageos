import type {
  SupplierFormValues,
  SupplierListFilters,
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

export const supplierStatusFilterOptions: readonly {
  readonly value: SupplierStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All suppliers' },
  { value: 'active', label: 'Active suppliers' },
  { value: 'inactive', label: 'Inactive suppliers' },
];
