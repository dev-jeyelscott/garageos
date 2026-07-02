import type {
  SupplierReturnFormLineValues,
  SupplierReturnFormValues,
  SupplierReturnListFilters,
  SupplierReturnStatus,
  SupplierReturnStatusFilter,
} from './supplier-return.types';

export const supplierReturnListPageSize = 25;

export const defaultSupplierReturnListFilters: SupplierReturnListFilters = {
  status: 'all',
  branch_id: 'all',
  supplier_id: 'all',
};

export const supplierReturnStatusFilterOptions: readonly {
  readonly value: SupplierReturnStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All returns' },
  { value: 'draft', label: 'Draft returns' },
  { value: 'posted', label: 'Posted returns' },
  { value: 'cancelled', label: 'Cancelled returns' },
];

export const supplierReturnStatusOptions: readonly {
  readonly value: SupplierReturnStatus;
  readonly label: string;
}[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function createDefaultSupplierReturnLine(): SupplierReturnFormLineValues {
  return {
    client_id: createClientId(),
    product_id: '',
    returned_quantity: '',
  };
}

export const defaultSupplierReturnFormValues: SupplierReturnFormValues = {
  branch_id: '',
  supplier_id: '',
  original_receiving_id: '',
  reason: '',
  lines: [createDefaultSupplierReturnLine()],
};

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random()}`;
}
