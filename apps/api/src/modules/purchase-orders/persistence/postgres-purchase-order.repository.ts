import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import { buildPurchaseOrderNumber } from '../../../shared/numbering/document-numbering';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderBranchStatus,
  type PurchaseOrderForReceivingRecord,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type PurchaseOrderSupplierStatus,
  type PurchasePaymentTerms,
  type PurchaseReceivingLineRecord,
  type PurchaseReceivingRecord,
  type SupplierPayableRecord,
} from '../application/purchase-order.records';
import {
  PurchaseOrderStore,
  type AllocatePurchaseOrderNumberInput,
  type CreateDraftPurchaseOrderInput,
  type CreatePurchaseReceivingInput,
  type CreatePurchaseReceivingLineInput,
  type CreateSupplierPayableInput,
  type IncrementPurchaseOrderLineReceivedQuantityInput,
  type SetReceivingLineFifoLayerInput,
  type UpdateDraftPurchaseOrderInput,
  type UpdatePurchaseOrderStatusInput,
} from '../application/purchase-order.store';

interface TenantTimezoneRow extends DatabaseRow {
  readonly timezone: string | null;
}

interface SequenceRow extends DatabaseRow {
  readonly last_value: number | string;
}

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
  readonly product_name: string | null;
  readonly ordered_quantity: string;
  readonly received_quantity: string;
  readonly unit_cost: string;
  readonly line_total: string;
  readonly notes: string | null;
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
export class PostgresPurchaseOrderRepository extends PurchaseOrderStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async getTenantTimezone(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const result = await client.query<TenantTimezoneRow>(
      `
        select timezone
        from tenants
        where id = $1::uuid
        limit 1
      `,
      [tenantId],
    );

    return result.rows[0]?.timezone ?? null;
  }

  async allocatePurchaseOrderNumber(
    input: AllocatePurchaseOrderNumberInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const sequenceDate = `${input.datePart.slice(0, 4)}-${input.datePart.slice(
      4,
      6,
    )}-${input.datePart.slice(6, 8)}`;
    const result = await client.query<SequenceRow>(
      `
        insert into document_sequences (
          tenant_id,
          sequence_type,
          sequence_date,
          last_value,
          updated_at
        )
        values ($1::uuid, 'purchase_order', $2::date, 1, now())
        on conflict (tenant_id, sequence_type, sequence_date)
        do update set
          last_value = document_sequences.last_value + 1,
          updated_at = now()
        returning last_value
      `,
      [input.tenantId, sequenceDate],
    );
    const sequence = result.rows[0]?.last_value;

    return sequence === undefined
      ? null
      : buildPurchaseOrderNumber(input.datePart, Number(sequence));
  }

  async findPurchaseOrderById(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderRecord | null> {
    const purchaseOrder = await this.findPurchaseOrderHeaderById(tenantId, purchaseOrderId, client);

    if (purchaseOrder === null) {
      return null;
    }

    const lines = await this.listPurchaseOrderLines(tenantId, purchaseOrder.id, client);

    return { ...purchaseOrder, lines };
  }

  async findPurchaseOrderByIdForUpdate(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderRecord | null> {
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
        where po.tenant_id = $1::uuid
          and po.id = $2::uuid
        for update of po
      `,
      [tenantId, purchaseOrderId],
    );
    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    const lines = await this.listPurchaseOrderLines(tenantId, purchaseOrderId, client, true);

    return { ...mapPurchaseOrderRow(row), lines };
  }

  async createDraftPurchaseOrder(
    input: CreateDraftPurchaseOrderInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderRecord> {
    await client.query(
      `
        insert into purchase_orders (
          id,
          tenant_id,
          branch_id,
          supplier_id,
          purchase_order_number,
          status,
          payment_terms,
          order_date,
          expected_receive_date,
          created_by_user_id,
          created_at,
          updated_by_user_id,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          'draft',
          $6,
          $7::date,
          $8::date,
          $9::uuid,
          $10::timestamptz,
          $9::uuid,
          $10::timestamptz
        )
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.supplierId,
        input.purchaseOrderNumber,
        input.paymentTerms,
        input.orderDate,
        input.expectedReceiveDate,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    await this.insertDraftPurchaseOrderLines(
      {
        tenantId: input.tenantId,
        purchaseOrderId: input.id,
        lines: input.lines,
      },
      client,
    );

    const purchaseOrder = await this.findPurchaseOrderById(input.tenantId, input.id, client);

    if (purchaseOrder === null) {
      throw new Error('Purchase order repository failed to create draft purchase order.');
    }

    return purchaseOrder;
  }

  async updateDraftPurchaseOrder(
    input: UpdateDraftPurchaseOrderInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<PurchaseOrderRecord | null> {
    const result = await client.query<PurchaseOrderRow>(
      `
        update purchase_orders po
        set
          branch_id = $3::uuid,
          supplier_id = $4::uuid,
          payment_terms = $5,
          order_date = $6::date,
          expected_receive_date = $7::date,
          updated_by_user_id = $8::uuid,
          updated_at = $9::timestamptz,
          lock_version = lock_version + 1
        from branches b, suppliers s
        where po.tenant_id = $1::uuid
          and po.id = $2::uuid
          and po.status = 'draft'
          and po.lock_version = $10
          and b.tenant_id = po.tenant_id
          and b.id = $3::uuid
          and s.tenant_id = po.tenant_id
          and s.id = $4::uuid
        returning
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
      `,
      [
        input.tenantId,
        input.purchaseOrderId,
        input.branchId,
        input.supplierId,
        input.paymentTerms,
        input.orderDate,
        input.expectedReceiveDate,
        input.updatedByUserId,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );
    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    await client.query(
      `
        delete from purchase_order_lines
        where tenant_id = $1::uuid
          and purchase_order_id = $2::uuid
      `,
      [input.tenantId, input.purchaseOrderId],
    );

    await this.insertDraftPurchaseOrderLines(
      {
        tenantId: input.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        lines: input.lines,
      },
      client,
    );

    const lines = await this.listPurchaseOrderLines(input.tenantId, input.purchaseOrderId, client);

    return { ...mapPurchaseOrderRow(row), lines };
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
    return this.listPurchaseOrderLines(tenantId, purchaseOrderId, client, true);
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
        update purchase_order_lines pol
        set
          received_quantity = received_quantity + $4::numeric(14,3)
        from products p
        where pol.tenant_id = $1::uuid
          and pol.purchase_order_id = $2::uuid
          and pol.id = $3::uuid
          and p.tenant_id = pol.tenant_id
          and p.id = pol.product_id
          and (received_quantity + $4::numeric(14,3)) <= ordered_quantity
        returning
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
          updated_at = now(),
          lock_version = lock_version + 1
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

  private async findPurchaseOrderHeaderById(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
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
        where po.tenant_id = $1::uuid
          and po.id = $2::uuid
        limit 1
      `,
      [tenantId, purchaseOrderId],
    );
    const row = result.rows[0];

    return row === undefined ? null : { ...mapPurchaseOrderRow(row), lines: [] };
  }

  private async listPurchaseOrderLines(
    tenantId: string,
    purchaseOrderId: string,
    client: DatabaseQueryClient,
    forUpdate = false,
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
        ${forUpdate ? 'for update of pol' : ''}
      `,
      [tenantId, purchaseOrderId],
    );

    return result.rows.map(mapPurchaseOrderLineRow);
  }

  private async insertDraftPurchaseOrderLines(
    input: Pick<CreateDraftPurchaseOrderInput, 'tenantId' | 'lines'> & {
      readonly purchaseOrderId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    if (input.lines.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const placeholders = input.lines.map((line, index) => {
      const offset = index * 8;
      values.push(
        input.tenantId,
        line.id,
        input.purchaseOrderId,
        line.productId,
        line.orderedQuantity,
        line.unitCost,
        line.lineTotal,
        line.notes,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::numeric(14,3),
        $${offset + 6}::numeric(14,2),
        $${offset + 7}::numeric(14,2),
        $${offset + 8}
      )`;
    });

    await client.query(
      `
        insert into purchase_order_lines (
          tenant_id,
          id,
          purchase_order_id,
          product_id,
          ordered_quantity,
          unit_cost,
          line_total,
          notes
        )
        values ${placeholders.join(', ')}
      `,
      values,
    );
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
    productName: row.product_name,
    orderedQuantity: row.ordered_quantity,
    receivedQuantity: row.received_quantity,
    unitCost: row.unit_cost,
    lineTotal: row.line_total,
    notes: row.notes,
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

function toDateOnlyString(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
