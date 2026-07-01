import { PurchaseOrderStore } from './application/purchase-order.store';
import { PostgresPurchaseOrderRepository } from './persistence/postgres-purchase-order.repository';

export const PURCHASE_ORDER_PROVIDERS = [
  {
    provide: PurchaseOrderStore,
    useClass: PostgresPurchaseOrderRepository,
  },
] as const;
