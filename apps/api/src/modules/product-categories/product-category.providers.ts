import { ProductCategoryStore } from './application/product-category.store';
import { PostgresProductCategoryRepository } from './persistence/postgres-product-category.repository';

export const PRODUCT_CATEGORY_PROVIDERS = [
  {
    provide: ProductCategoryStore,
    useClass: PostgresProductCategoryRepository,
  },
] as const;
