import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  PurchaseOrderForReceivingRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderStatus,
  PurchaseReceivingLineRecord,
  PurchaseReceivingRecord,
  SupplierPayableRecord,
} from './purchase-order.records';

export interface CreatePurchaseReceivingInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly purchaseOrderId: string;
  readonly supplierId: string;
  readonly receivedAt: Date;
  readonly receivedByUserId: string;
  readonly paymentMethod: string | null;
  readonly paymentReference: string | null;
  readonly postedAt: Date;
}

export interface CreatePurchaseReceivingLineInput {
  readonly id: string;
  readonly tenantId: string;
  readonly receivingId: string;
  readonly purchaseOrderLineId: string;
  readonly productId: string;
  readonly receivedQuantity: string;
  readonly receivedUnitCost: string;
  readonly fifoLayerId: string | null;
}

export interface IncrementPurchaseOrderLineReceivedQuantityInput {
  readonly tenantId: string;
  readonly purchaseOrderId: string;
  readonly purchaseOrderLineId: string;
  readonly receivedQuantity: string;
}

export interface SetReceivingLineFifoLayerInput {
  readonly tenantId: string;
  readonly receivingLineId: string;
  readonly fifoLayerId: string;
}

export interface UpdatePurchaseOrderStatusInput {
  readonly tenantId: string;
  readonly purchaseOrderId: string;
  readonly fromStatus: PurchaseOrderStatus;
  readonly toStatus: PurchaseOrderStatus;
}

export interface CreateSupplierPayableInput {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly branchId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly amountDelta: string;
  readonly occurredAt: Date;
}

export abstract class PurchaseOrderStore {
  abstract lockPurchaseOrderForReceiving(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null>;

  abstract listPurchaseOrderLinesForUpdate(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderLineRecord[]>;

  abstract createReceiving(
    input: CreatePurchaseReceivingInput,
    client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingRecord>;

  abstract createReceivingLine(
    input: CreatePurchaseReceivingLineInput,
    client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingLineRecord>;

  abstract setReceivingLineFifoLayerId(
    input: SetReceivingLineFifoLayerInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract incrementPurchaseOrderLineReceivedQuantity(
    input: IncrementPurchaseOrderLineReceivedQuantityInput,
    client: DatabaseQueryClient,
  ): Promise<PurchaseOrderLineRecord | null>;

  abstract updatePurchaseOrderStatus(
    input: UpdatePurchaseOrderStatusInput,
    client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null>;

  abstract createSupplierPayable(
    input: CreateSupplierPayableInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierPayableRecord>;
}
