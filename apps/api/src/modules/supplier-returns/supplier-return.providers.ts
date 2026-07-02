import { SupplierReturnStore } from './application/supplier-return.store';
import { PostgresSupplierReturnRepository } from './persistence/postgres-supplier-return.repository';

export const SUPPLIER_RETURN_PROVIDERS = [
  {
    provide: SupplierReturnStore,
    useClass: PostgresSupplierReturnRepository,
  },
] as const;
