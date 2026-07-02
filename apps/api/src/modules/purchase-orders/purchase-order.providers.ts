import { PurchaseOrderQueryStore } from './application/purchase-order-query.store';
import { PurchaseOrderStore } from './application/purchase-order.store';
import { PostgresPurchaseOrderQueryRepository } from './persistence/postgres-purchase-order-query.repository';
import { PostgresPurchaseOrderRepository } from './persistence/postgres-purchase-order.repository';

export const PURCHASE_ORDER_PROVIDERS = [
  {
    provide: PurchaseOrderStore,
    useClass: PostgresPurchaseOrderRepository,
  },
  {
    provide: PurchaseOrderQueryStore,
    useClass: PostgresPurchaseOrderQueryRepository,
  },
] as const;
