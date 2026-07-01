import { SupplierStore } from './application/supplier.store';
import { PostgresSupplierRepository } from './persistence/postgres-supplier.repository';

export const SUPPLIER_PROVIDERS = [
  {
    provide: SupplierStore,
    useClass: PostgresSupplierRepository,
  },
] as const;
