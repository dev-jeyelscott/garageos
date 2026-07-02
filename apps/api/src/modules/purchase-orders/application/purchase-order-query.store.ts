import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { PurchaseOrderRecord, PurchaseOrderStatus } from './purchase-order.records';

export type PurchaseOrderStatusFilter = PurchaseOrderStatus | 'all';

export interface PurchaseOrderListCursor {
  readonly updatedAt: Date;
  readonly id: string;
}

export interface ListPurchaseOrdersInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly normalizedSearch: string | null;
  readonly status: PurchaseOrderStatusFilter;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly limit: number;
  readonly cursor: PurchaseOrderListCursor | null;
}

export abstract class PurchaseOrderQueryStore {
  abstract listPurchaseOrders(
    input: ListPurchaseOrdersInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderRecord[]>;
}
