import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type PurchasePaymentTerms,
} from '../application/purchase-order.records';
import {
  PurchaseOrderQueryStore,
  type ListPurchaseOrdersInput,
} from '../application/purchase-order-query.store';

interface PurchaseOrderRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly supplier_id: string;
  readonly supplier_name: string | null;
  readonly purchase_order_number: string;
  readonly status: string;
  readonly payment_terms: string;
  readonly order_date: Date | string;
  readonly expected_receive_date: Date | string | null;
  readonly lock_version: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface PurchaseOrderLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly purchase_order_id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly ordered_quantity: string;
  readonly received_quantity: string;
  readonly unit_cost: string;
  readonly line_total: string;
  readonly notes: string | null;
}

const PURCHASE_ORDER_COLUMNS = `
  po.id,
  po.tenant_id,
  po.branch_id,
  b.name as branch_name,
  po.supplier_id,
  s.name as supplier_name,
  po.purchase_order_number,
  po.status,
  po.payment_terms,
  po.order_date,
  po.expected_receive_date,
  po.lock_version,
  po.created_at,
  po.updated_at
`;

const PURCHASE_ORDER_LINE_COLUMNS = `
  pol.id,
  pol.tenant_id,
  pol.purchase_order_id,
  pol.product_id,
  p.name as product_name,
  pol.ordered_quantity::text,
  pol.received_quantity::text,
  pol.unit_cost::text,
  pol.line_total::text,
  pol.notes
`;

@Injectable()
export class PostgresPurchaseOrderQueryRepository extends PurchaseOrderQueryStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async listPurchaseOrders(
    input: ListPurchaseOrdersInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly PurchaseOrderRecord[]> {
    const values: unknown[] = [
      input.tenantId,
      input.branchIds,
      input.status,
      input.normalizedSearch,
      input.fromDate,
      input.toDate,
    ];
    const predicates = [
      'po.tenant_id = $1::uuid',
      '($2::uuid[] is null or po.branch_id = any($2::uuid[]))',
      "($3::text = 'all' or po.status = $3::text)",
      `(
        $4::text is null
        or lower(po.purchase_order_number) like $4::text
        or lower(s.name) like $4::text
      )`,
      '($5::date is null or po.order_date >= $5::date)',
      '($6::date is null or po.order_date <= $6::date)',
    ];

    if (input.cursor !== null) {
      values.push(input.cursor.updatedAt, input.cursor.id);
      predicates.push(
        `(po.updated_at, po.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }

    values.push(input.limit);
    const limitParameter = `$${values.length}`;

    const result = await client.query<PurchaseOrderRow>(
      `
        select ${PURCHASE_ORDER_COLUMNS}
        from purchase_orders po
        inner join branches b
          on b.tenant_id = po.tenant_id
         and b.id = po.branch_id
        inner join suppliers s
          on s.tenant_id = po.tenant_id
         and s.id = po.supplier_id
        where ${predicates.join('\n          and ')}
        order by po.updated_at desc, po.id desc
        limit ${limitParameter}
      `,
      values,
    );

    const purchaseOrderHeaders = result.rows.map(mapPurchaseOrderRow);

    return Promise.all(
      purchaseOrderHeaders.map(async (purchaseOrder) => ({
        ...purchaseOrder,
        lines: await this.listPurchaseOrderLines(input.tenantId, purchaseOrder.id, client),
      })),
    );
  }

  private async listPurchaseOrderLines(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderLineRecord[]> {
    const result = await client.query<PurchaseOrderLineRow>(
      `
        select ${PURCHASE_ORDER_LINE_COLUMNS}
        from purchase_order_lines pol
        inner join products p
          on p.tenant_id = pol.tenant_id
         and p.id = pol.product_id
        where pol.tenant_id = $1::uuid
          and pol.purchase_order_id = $2::uuid
        order by pol.id asc
      `,
      [tenantId, purchaseOrderId],
    );

    return result.rows.map(mapPurchaseOrderLineRow);
  }
}

function mapPurchaseOrderRow(row: PurchaseOrderRow): Omit<PurchaseOrderRecord, 'lines'> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    purchaseOrderNumber: row.purchase_order_number,
    status: mapPurchaseOrderStatus(row.status),
    paymentTerms: mapPurchasePaymentTerms(row.payment_terms),
    orderDate: toDateOnlyString(row.order_date),
    expectedReceiveDate:
      row.expected_receive_date === null ? null : toDateOnlyString(row.expected_receive_date),
    lockVersion: Number(row.lock_version),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapPurchaseOrderLineRow(row: PurchaseOrderLineRow): PurchaseOrderLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    productName: row.product_name,
    orderedQuantity: row.ordered_quantity,
    receivedQuantity: row.received_quantity,
    unitCost: row.unit_cost,
    lineTotal: row.line_total,
    notes: row.notes,
  };
}

function mapPurchaseOrderStatus(status: string): PurchaseOrderStatus {
  if (
    status === PURCHASE_ORDER_STATUSES.DRAFT ||
    status === PURCHASE_ORDER_STATUSES.ORDERED ||
    status === PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED ||
    status === PURCHASE_ORDER_STATUSES.RECEIVED ||
    status === PURCHASE_ORDER_STATUSES.CLOSED ||
    status === PURCHASE_ORDER_STATUSES.CANCELLED
  ) {
    return status;
  }

  throw new Error(`Unsupported purchase order status: ${status}`);
}

function mapPurchasePaymentTerms(paymentTerms: string): PurchasePaymentTerms {
  if (
    paymentTerms === PURCHASE_PAYMENT_TERMS.CASH ||
    paymentTerms === PURCHASE_PAYMENT_TERMS.CREDIT
  ) {
    return paymentTerms;
  }

  throw new Error(`Unsupported purchase payment terms: ${paymentTerms}`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOnlyString(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}
