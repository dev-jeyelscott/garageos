import type { PurchaseOrderListFilters, PurchaseOrderStatusFilter } from './purchase-order.types';

export const purchaseOrderListPageSize = 25;

export const defaultPurchaseOrderListFilters: PurchaseOrderListFilters = {
  q: '',
  status: 'all',
  branch_id: 'all',
  from_date: '',
  to_date: '',
};

export const purchaseOrderStatusFilterOptions: readonly {
  readonly value: PurchaseOrderStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All purchase orders' },
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Partially received' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];
