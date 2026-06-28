import { ProductStore } from './application/product.store';
import { PostgresProductRepository } from './persistence/postgres-product.repository';

export const PRODUCT_PROVIDERS = [
  {
    provide: ProductStore,
    useClass: PostgresProductRepository,
  },
] as const;
