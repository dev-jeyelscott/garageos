import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderBranchStatus,
  type PurchaseOrderForReceivingRecord,
  type PurchaseOrderLineRecord,
  type PurchaseOrderStatus,
  type PurchaseOrderSupplierStatus,
  type PurchasePaymentTerms,
  type PurchaseReceivingLineRecord,
  type PurchaseReceivingRecord,
  type SupplierPayableRecord,
} from '../application/purchase-order.records';
import {
  PurchaseOrderStore,
  type CreatePurchaseReceivingInput,
  type CreatePurchaseReceivingLineInput,
  type CreateSupplierPayableInput,
  type IncrementPurchaseOrderLineReceivedQuantityInput,
  type SetReceivingLineFifoLayerInput,
  type UpdatePurchaseOrderStatusInput,
} from '../application/purchase-order.store';

interface PurchaseOrderForReceivingRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly supplier_id: string;
  readonly purchase_order_number: string;
  readonly status: string;
  readonly payment_terms: string;
  readonly branch_status: string;
  readonly supplier_status: string;
}

interface PurchaseOrderLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly purchase_order_id: string;
  readonly product_id: string;
  readonly ordered_quantity: string;
  readonly received_quantity: string;
  readonly unit_cost: string;
}

interface PurchaseReceivingRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly purchase_order_id: string;
  readonly supplier_id: string;
  readonly received_at: Date | string;
  readonly received_by_user_id: string;
  readonly payment_method: string | null;
  readonly payment_reference: string | null;
  readonly posted_at: Date | string;
}

interface PurchaseReceivingLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly receiving_id: string;
  readonly purchase_order_line_id: string;
  readonly product_id: string;
  readonly received_quantity: string;
  readonly received_unit_cost: string;
  readonly fifo_layer_id: string | null;
}

interface SupplierPayableRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly supplier_id: string;
  readonly branch_id: string | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly amount_delta: string;
  readonly occurred_at: Date | string;
}

@Injectable()
export class PostgresPurchaseOrderRepository extends PurchaseOrderStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async lockPurchaseOrderForReceiving(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    const result = await client.query<PurchaseOrderForReceivingRow>(
      `
        select
          po.id,
          po.tenant_id,
          po.branch_id,
          po.supplier_id,
          po.purchase_order_number,
          po.status,
          po.payment_terms,
          b.status as branch_status,
          s.status as supplier_status
        from purchase_orders po
        inner join branches b
          on b.tenant_id = po.tenant_id
         and b.id = po.branch_id
        inner join suppliers s
          on s.tenant_id = po.tenant_id
         and s.id = po.supplier_id
        where po.tenant_id = $1::uuid
          and po.id = $2::uuid
        for update of po
      `,
      [tenantId, purchaseOrderId],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapPurchaseOrderForReceivingRow(row);
  }

  async listPurchaseOrderLinesForUpdate(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderLineRecord[]> {
    const result = await client.query<PurchaseOrderLineRow>(
      `
        select
          id,
          tenant_id,
          purchase_order_id,
          product_id,
          ordered_quantity::text,
          received_quantity::text,
          unit_cost::text
        from purchase_order_lines
        where tenant_id = $1::uuid
          and purchase_order_id = $2::uuid
        order by id asc
        for update
      `,
      [tenantId, purchaseOrderId],
    );

    return result.rows.map(mapPurchaseOrderLineRow);
  }

  async createReceiving(
    input: CreatePurchaseReceivingInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseReceivingRecord> {
    const result = await client.query<PurchaseReceivingRow>(
      `
        insert into purchase_receivings (
          id,
          tenant_id,
          branch_id,
          purchase_order_id,
          supplier_id,
          received_at,
          received_by_user_id,
          payment_method,
          payment_reference,
          posted_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::timestamptz,
          $7::uuid,
          $8,
          $9,
          $10::timestamptz
        )
        returning
          id,
          tenant_id,
          branch_id,
          purchase_order_id,
          supplier_id,
          received_at,
          received_by_user_id,
          payment_method,
          payment_reference,
          posted_at
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.purchaseOrderId,
        input.supplierId,
        input.receivedAt,
        input.receivedByUserId,
        input.paymentMethod,
        input.paymentReference,
        input.postedAt,
      ],
    );

    return mapPurchaseReceivingRow(getRequiredRow(result, 'create purchase receiving'));
  }

  async createReceivingLine(
    input: CreatePurchaseReceivingLineInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseReceivingLineRecord> {
    const result = await client.query<PurchaseReceivingLineRow>(
      `
        insert into purchase_receiving_lines (
          id,
          tenant_id,
          receiving_id,
          purchase_order_line_id,
          product_id,
          received_quantity,
          received_unit_cost,
          fifo_layer_id
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::numeric(14,3),
          $7::numeric(14,2),
          $8::uuid
        )
        returning
          id,
          tenant_id,
          receiving_id,
          purchase_order_line_id,
          product_id,
          received_quantity::text,
          received_unit_cost::text,
          fifo_layer_id
      `,
      [
        input.id,
        input.tenantId,
        input.receivingId,
        input.purchaseOrderLineId,
        input.productId,
        input.receivedQuantity,
        input.receivedUnitCost,
        input.fifoLayerId,
      ],
    );

    return mapPurchaseReceivingLineRow(getRequiredRow(result, 'create purchase receiving line'));
  }

  async setReceivingLineFifoLayerId(
    input: SetReceivingLineFifoLayerInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<void> {
    await client.query(
      `
        update purchase_receiving_lines
        set fifo_layer_id = $3::uuid
        where tenant_id = $1::uuid
          and id = $2::uuid
      `,
      [input.tenantId, input.receivingLineId, input.fifoLayerId],
    );
  }

  async incrementPurchaseOrderLineReceivedQuantity(
    input: IncrementPurchaseOrderLineReceivedQuantityInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderLineRecord | null> {
    const result = await client.query<PurchaseOrderLineRow>(
      `
        update purchase_order_lines
        set received_quantity = received_quantity + $4::numeric(14,3)
        where tenant_id = $1::uuid
          and purchase_order_id = $2::uuid
          and id = $3::uuid
          and (received_quantity + $4::numeric(14,3)) <= ordered_quantity
        returning
          id,
          tenant_id,
          purchase_order_id,
          product_id,
          ordered_quantity::text,
          received_quantity::text,
          unit_cost::text
      `,
      [input.tenantId, input.purchaseOrderId, input.purchaseOrderLineId, input.receivedQuantity],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapPurchaseOrderLineRow(row);
  }

  async updatePurchaseOrderStatus(
    input: UpdatePurchaseOrderStatusInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    const result = await client.query<PurchaseOrderForReceivingRow>(
      `
        update purchase_orders po
        set
          status = $4,
          updated_at = now()
        from branches b, suppliers s
        where po.tenant_id = $1::uuid
          and po.id = $2::uuid
          and po.status = $3
          and b.tenant_id = po.tenant_id
          and b.id = po.branch_id
          and s.tenant_id = po.tenant_id
          and s.id = po.supplier_id
        returning
          po.id,
          po.tenant_id,
          po.branch_id,
          po.supplier_id,
          po.purchase_order_number,
          po.status,
          po.payment_terms,
          b.status as branch_status,
          s.status as supplier_status
      `,
      [input.tenantId, input.purchaseOrderId, input.fromStatus, input.toStatus],
    );

    const [row] = result.rows;

    return row === undefined ? null : mapPurchaseOrderForReceivingRow(row);
  }

  async createSupplierPayable(
    input: CreateSupplierPayableInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<SupplierPayableRecord> {
    const result = await client.query<SupplierPayableRow>(
      `
        insert into supplier_payables (
          id,
          tenant_id,
          supplier_id,
          branch_id,
          source_type,
          source_id,
          amount_delta,
          occurred_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::uuid,
          $7::numeric(14,2),
          $8::timestamptz
        )
        returning
          id,
          tenant_id,
          supplier_id,
          branch_id,
          source_type,
          source_id,
          amount_delta::text,
          occurred_at
      `,
      [
        input.id,
        input.tenantId,
        input.supplierId,
        input.branchId,
        input.sourceType,
        input.sourceId,
        input.amountDelta,
        input.occurredAt,
      ],
    );

    return mapSupplierPayableRow(getRequiredRow(result, 'create supplier payable'));
  }
}

function mapPurchaseOrderForReceivingRow(
  row: PurchaseOrderForReceivingRow,
): PurchaseOrderForReceivingRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    supplierId: row.supplier_id,
    purchaseOrderNumber: row.purchase_order_number,
    status: mapPurchaseOrderStatus(row.status),
    paymentTerms: mapPurchasePaymentTerms(row.payment_terms),
    branchStatus: mapBranchStatus(row.branch_status),
    supplierStatus: mapSupplierStatus(row.supplier_status),
  };
}

function mapPurchaseOrderLineRow(row: PurchaseOrderLineRow): PurchaseOrderLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    orderedQuantity: row.ordered_quantity,
    receivedQuantity: row.received_quantity,
    unitCost: row.unit_cost,
  };
}

function mapPurchaseReceivingRow(row: PurchaseReceivingRow): PurchaseReceivingRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    purchaseOrderId: row.purchase_order_id,
    supplierId: row.supplier_id,
    receivedAt: toDate(row.received_at),
    receivedByUserId: row.received_by_user_id,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    postedAt: toDate(row.posted_at),
  };
}

function mapPurchaseReceivingLineRow(row: PurchaseReceivingLineRow): PurchaseReceivingLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    receivingId: row.receiving_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    productId: row.product_id,
    receivedQuantity: row.received_quantity,
    receivedUnitCost: row.received_unit_cost,
    fifoLayerId: row.fifo_layer_id,
  };
}

function mapSupplierPayableRow(row: SupplierPayableRow): SupplierPayableRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    supplierId: row.supplier_id,
    branchId: row.branch_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    amountDelta: row.amount_delta,
    occurredAt: toDate(row.occurred_at),
  };
}

function mapPurchaseOrderStatus(status: string): PurchaseOrderStatus {
  if ((Object.values(PURCHASE_ORDER_STATUSES) as readonly string[]).includes(status)) {
    return status as PurchaseOrderStatus;
  }

  throw new Error(`Unknown purchase order status: ${status}.`);
}

function mapPurchasePaymentTerms(paymentTerms: string): PurchasePaymentTerms {
  if ((Object.values(PURCHASE_PAYMENT_TERMS) as readonly string[]).includes(paymentTerms)) {
    return paymentTerms as PurchasePaymentTerms;
  }

  throw new Error(`Unknown purchase payment terms: ${paymentTerms}.`);
}

function mapBranchStatus(status: string): PurchaseOrderBranchStatus {
  if (status === 'active' || status === 'inactive') {
    return status;
  }

  throw new Error(`Unknown branch status: ${status}.`);
}

function mapSupplierStatus(status: string): PurchaseOrderSupplierStatus {
  if (status === 'active' || status === 'inactive') {
    return status;
  }

  throw new Error(`Unknown supplier status: ${status}.`);
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Purchase order repository failed to ${operation}.`);
  }

  return row;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
