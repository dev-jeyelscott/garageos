import { ShopStore } from './application/shop.store';
import { PostgresShopRepository } from './persistence/postgres-shop.repository';

export const SHOP_PROVIDERS = [
  {
    provide: ShopStore,
    useClass: PostgresShopRepository,
  },
] as const;
