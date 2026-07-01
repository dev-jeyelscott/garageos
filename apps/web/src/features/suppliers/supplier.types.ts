import type { ApiPaginationMeta } from '../../lib/api-envelope';

export type SupplierStatus = 'active' | 'inactive';
export type SupplierStatusFilter = 'all' | SupplierStatus;

export interface SupplierListFilters {
  readonly q: string;
  readonly status: SupplierStatusFilter;
}

export interface SupplierListItem {
  readonly id: string;
  readonly name: string;
  readonly status: SupplierStatus;
  readonly contact_person: string | null;
  readonly mobile_number: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

export interface SupplierListResult {
  readonly suppliers: readonly SupplierListItem[];
  readonly pagination: ApiPaginationMeta | null;
}

export type SupplierListState =
  | {
      readonly status: 'idle' | 'loading';
      readonly suppliers: readonly SupplierListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'loaded' | 'loading_more';
      readonly suppliers: readonly SupplierListItem[];
      readonly pagination: ApiPaginationMeta | null;
    }
  | {
      readonly status: 'error';
      readonly suppliers: readonly SupplierListItem[];
      readonly pagination: ApiPaginationMeta | null;
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };
