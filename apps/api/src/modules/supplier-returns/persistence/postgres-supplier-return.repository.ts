import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  SupplierReturnStore,
  type CancelSupplierReturnInput,
  type CreateSupplierCreditInput,
  type CreateSupplierReturnInput,
  type CreateSupplierReturnLineInput,
  type ListSupplierReturnsInput,
  type PostSupplierReturnInput,
  type ReceivingTraceLineRecord,
  type ReceivingTraceRecord,
  type SupplierCreditRecord,
  type SupplierReturnBranchStatus,
  type SupplierReturnLineRecord,
  type SupplierReturnRecord,
  type SupplierReturnStatus,
  type SupplierReturnSupplierStatus,
  type UpdateDraftSupplierReturnInput,
  type UpdatePostedSupplierReturnLineInput,
} from '../application/supplier-return.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface SupplierReturnRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly branch_status: string;
  readonly supplier_id: string;
  readonly supplier_name: string | null;
  readonly supplier_status: string;
  readonly original_receiving_id: string | null;
  readonly status: string;
  readonly reason: string;
  readonly financial_value: string;
  readonly supplier_credit_id: string | null;
  readonly posted_at: Date | string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
}

interface SupplierReturnLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly supplier_return_id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly returned_quantity: string;
  readonly unit_cost: string;
  readonly total_cost: string;
}

interface ReceivingTraceRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly supplier_id: string;
  readonly purchase_order_id: string;
  readonly payment_terms: string;
  readonly receiving_line_id: string;
  readonly product_id: string;
  readonly received_quantity: string;
  readonly received_unit_cost: string;
  readonly already_returned_quantity: string;
}

interface SupplierBalanceRow extends DatabaseRow {
  readonly amount: string;
}

interface SupplierCreditRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly supplier_id: string;
  readonly branch_id: string | null;
  readonly amount: string;
  readonly reason: string;
  readonly source_type: string | null;
  readonly source_id: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
}

const SUPPLIER_RETURN_COLUMNS = `
  sr.id,
  sr.tenant_id,
  sr.branch_id,
  b.name as branch_name,
  b.status as branch_status,
  sr.supplier_id,
  s.name as supplier_name,
  s.status as supplier_status,
  sr.original_receiving_id,
  sr.status,
  sr.reason,
  sr.financial_value::text,
  sr.supplier_credit_id,
  sr.posted_at,
  sr.created_by_user_id,
  sr.created_at
`;

const SUPPLIER_RETURN_LINE_COLUMNS = `
  srl.id,
  srl.tenant_id,
  srl.supplier_return_id,
  srl.product_id,
  p.name as product_name,
  srl.returned_quantity::text,
  srl.unit_cost::text,
  srl.total_cost::text
`;

@Injectable()
export class PostgresSupplierReturnRepository extends SupplierReturnStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<BooleanRow>(
      `
        select exists (
          select 1
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
           and r.role_type = 'shop_owner'
          where ur.tenant_id = $1::uuid
            and ur.user_id = $2::uuid
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async listSupplierReturns(
    input: ListSupplierReturnsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly SupplierReturnRecord[]> {
    const values: unknown[] = [input.tenantId, input.status, input.limit];
    const predicates = ['sr.tenant_id = $1::uuid', "($2::text = 'all' or sr.status = $2::text)"];

    if (input.branchIds !== null) {
      values.push(input.branchIds);
      predicates.push(`sr.branch_id = any($${values.length}::uuid[])`);
    }

    if (input.supplierId !== null) {
      values.push(input.supplierId);
      predicates.push(`sr.supplier_id = $${values.length}::uuid`);
    }

    if (input.cursor !== null) {
      values.push(input.cursor.createdAt, input.cursor.id);
      predicates.push(
        `(sr.created_at, sr.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }

    const result = await client.query<SupplierReturnRow>(
      `
        select ${SUPPLIER_RETURN_COLUMNS}
        from supplier_returns sr
        inner join branches b
          on b.tenant_id = sr.tenant_id
         and b.id = sr.branch_id
        inner join suppliers s
          on s.tenant_id = sr.tenant_id
         and s.id = sr.supplier_id
        where ${predicates.join('\n          and ')}
        order by sr.created_at desc, sr.id desc
        limit $3
      `,
      values,
    );

    return Promise.all(result.rows.map((row) => this.mapSupplierReturnWithLines(row, client)));
  }

  async findSupplierReturnById(
    tenantId: string,
    supplierReturnId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<SupplierReturnRecord | null> {
    const row = await this.findSupplierReturnHeaderById(tenantId, supplierReturnId, client, false);

    return row === null ? null : this.mapSupplierReturnWithLines(row, client);
  }

  async lockSupplierReturnById(
    tenantId: string,
    supplierReturnId: string,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    const row = await this.findSupplierReturnHeaderById(tenantId, supplierReturnId, client, true);

    return row === null ? null : this.mapSupplierReturnWithLines(row, client, true);
  }

  async createSupplierReturn(
    input: CreateSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord> {
    await client.query(
      `
        insert into supplier_returns (
          id,
          tenant_id,
          branch_id,
          supplier_id,
          original_receiving_id,
          status,
          reason,
          financial_value,
          supplier_credit_id,
          posted_at,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          'draft',
          $6,
          0,
          null,
          null,
          $7::uuid,
          $8::timestamptz
        )
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.supplierId,
        input.originalReceivingId,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    await this.insertSupplierReturnLines(input.lines, client);

    const supplierReturn = await this.findSupplierReturnById(input.tenantId, input.id, client);

    if (supplierReturn === null) {
      throw new Error('Supplier return repository failed to create supplier return.');
    }

    return supplierReturn;
  }

  async updateDraftSupplierReturn(
    input: UpdateDraftSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    const result = await client.query<SupplierReturnRow>(
      `
        update supplier_returns sr
        set
          branch_id = $3::uuid,
          supplier_id = $4::uuid,
          original_receiving_id = $5::uuid,
          reason = $6,
          financial_value = 0,
          supplier_credit_id = null,
          posted_at = null
        from branches b, suppliers s
        where sr.tenant_id = $1::uuid
          and sr.id = $2::uuid
          and sr.status = 'draft'
          and b.tenant_id = sr.tenant_id
          and b.id = $3::uuid
          and s.tenant_id = sr.tenant_id
          and s.id = $4::uuid
        returning ${SUPPLIER_RETURN_COLUMNS}
      `,
      [
        input.tenantId,
        input.supplierReturnId,
        input.branchId,
        input.supplierId,
        input.originalReceivingId,
        input.reason,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    await client.query(
      `
        delete from supplier_return_lines
        where tenant_id = $1::uuid
          and supplier_return_id = $2::uuid
      `,
      [input.tenantId, input.supplierReturnId],
    );
    await this.insertSupplierReturnLines(input.lines, client);

    return this.mapSupplierReturnWithLines(row, client);
  }

  async cancelDraftSupplierReturn(
    input: CancelSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    const result = await client.query<SupplierReturnRow>(
      `
        update supplier_returns sr
        set status = 'cancelled'
        from branches b, suppliers s
        where sr.tenant_id = $1::uuid
          and sr.id = $2::uuid
          and sr.status = 'draft'
          and b.tenant_id = sr.tenant_id
          and b.id = sr.branch_id
          and s.tenant_id = sr.tenant_id
          and s.id = sr.supplier_id
        returning ${SUPPLIER_RETURN_COLUMNS}
      `,
      [input.tenantId, input.supplierReturnId],
    );

    const row = result.rows[0];

    return row === undefined ? null : this.mapSupplierReturnWithLines(row, client);
  }

  async updatePostedSupplierReturnLine(
    input: UpdatePostedSupplierReturnLineInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnLineRecord | null> {
    const result = await client.query<SupplierReturnLineRow>(
      `
        update supplier_return_lines srl
        set
          unit_cost = $3::numeric(14,2),
          total_cost = $4::numeric(14,2)
        from products p
        where srl.tenant_id = $1::uuid
          and srl.id = $2::uuid
          and p.tenant_id = srl.tenant_id
          and p.id = srl.product_id
        returning ${SUPPLIER_RETURN_LINE_COLUMNS}
      `,
      [input.tenantId, input.supplierReturnLineId, input.unitCost, input.totalCost],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapSupplierReturnLineRow(row);
  }

  async markSupplierReturnPosted(
    input: PostSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    const result = await client.query<SupplierReturnRow>(
      `
        update supplier_returns sr
        set
          status = 'posted',
          financial_value = $3::numeric(14,2),
          supplier_credit_id = $4::uuid,
          posted_at = $5::timestamptz
        from branches b, suppliers s
        where sr.tenant_id = $1::uuid
          and sr.id = $2::uuid
          and sr.status = 'draft'
          and b.tenant_id = sr.tenant_id
          and b.id = sr.branch_id
          and s.tenant_id = sr.tenant_id
          and s.id = sr.supplier_id
        returning ${SUPPLIER_RETURN_COLUMNS}
      `,
      [
        input.tenantId,
        input.supplierReturnId,
        input.financialValue,
        input.supplierCreditId,
        input.postedAt,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : this.mapSupplierReturnWithLines(row, client);
  }

  async getReceivingTrace(
    tenantId: string,
    receivingId: string,
    client: DatabaseQueryClient,
  ): Promise<ReceivingTraceRecord | null> {
    const result = await client.query<ReceivingTraceRow>(
      `
        with returned_totals as (
          select
            srl.product_id,
            coalesce(sum(srl.returned_quantity), 0)::numeric(14,3) as already_returned_quantity
          from supplier_returns sr
          inner join supplier_return_lines srl
            on srl.tenant_id = sr.tenant_id
           and srl.supplier_return_id = sr.id
          where sr.tenant_id = $1::uuid
            and sr.original_receiving_id = $2::uuid
            and sr.status = 'posted'
          group by srl.product_id
        )
        select
          pr.id,
          pr.tenant_id,
          pr.branch_id,
          pr.supplier_id,
          pr.purchase_order_id,
          po.payment_terms,
          prl.id as receiving_line_id,
          prl.product_id,
          prl.received_quantity::text,
          prl.received_unit_cost::text,
          coalesce(rt.already_returned_quantity, 0)::text as already_returned_quantity
        from purchase_receivings pr
        inner join purchase_orders po
          on po.tenant_id = pr.tenant_id
         and po.id = pr.purchase_order_id
        inner join purchase_receiving_lines prl
          on prl.tenant_id = pr.tenant_id
         and prl.receiving_id = pr.id
        left join returned_totals rt
          on rt.product_id = prl.product_id
        where pr.tenant_id = $1::uuid
          and pr.id = $2::uuid
        order by prl.id asc
        for update of pr, prl
      `,
      [tenantId, receivingId],
    );

    const firstRow = result.rows[0];

    if (firstRow === undefined) {
      return null;
    }

    return {
      id: firstRow.id,
      tenantId: firstRow.tenant_id,
      branchId: firstRow.branch_id,
      supplierId: firstRow.supplier_id,
      purchaseOrderId: firstRow.purchase_order_id,
      paymentTerms: mapPaymentTerms(firstRow.payment_terms),
      lines: result.rows.map(mapReceivingTraceLineRow),
    };
  }

  async getSupplierPayableBalanceForUpdate(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient,
  ): Promise<string> {
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text || ':supplier_ap', 0))`,
      [tenantId, supplierId],
    );

    const result = await client.query<SupplierBalanceRow>(
      `
        select (
          coalesce((
            select sum(amount_delta)
            from supplier_payables
            where tenant_id = $1::uuid
              and supplier_id = $2::uuid
          ), 0)
          - coalesce((
            select sum(amount)
            from supplier_payments
            where tenant_id = $1::uuid
              and supplier_id = $2::uuid
          ), 0)
          - coalesce((
            select sum(amount)
            from supplier_credits
            where tenant_id = $1::uuid
              and supplier_id = $2::uuid
          ), 0)
        )::numeric(14,2)::text as amount
      `,
      [tenantId, supplierId],
    );

    return result.rows[0]?.amount ?? '0.00';
  }

  async createSupplierCredit(
    input: CreateSupplierCreditInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierCreditRecord> {
    const result = await client.query<SupplierCreditRow>(
      `
        insert into supplier_credits (
          id,
          tenant_id,
          supplier_id,
          branch_id,
          amount,
          reason,
          source_type,
          source_id,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::numeric(14,2),
          $6,
          $7,
          $8::uuid,
          $9::uuid,
          $10::timestamptz
        )
        returning
          id,
          tenant_id,
          supplier_id,
          branch_id,
          amount::text,
          reason,
          source_type,
          source_id,
          created_by_user_id,
          created_at
      `,
      [
        input.id,
        input.tenantId,
        input.supplierId,
        input.branchId,
        input.amount,
        input.reason,
        input.sourceType,
        input.sourceId,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapSupplierCreditRow(getRequiredRow(result, 'create supplier credit'));
  }

  private async findSupplierReturnHeaderById(
    tenantId: string,
    supplierReturnId: string,
    client: DatabaseQueryClient,
    forUpdate: boolean,
  ): Promise<SupplierReturnRow | null> {
    const result = await client.query<SupplierReturnRow>(
      `
        select ${SUPPLIER_RETURN_COLUMNS}
        from supplier_returns sr
        inner join branches b
          on b.tenant_id = sr.tenant_id
         and b.id = sr.branch_id
        inner join suppliers s
          on s.tenant_id = sr.tenant_id
         and s.id = sr.supplier_id
        where sr.tenant_id = $1::uuid
          and sr.id = $2::uuid
        ${forUpdate ? 'for update of sr' : ''}
      `,
      [tenantId, supplierReturnId],
    );

    return result.rows[0] ?? null;
  }

  private async mapSupplierReturnWithLines(
    row: SupplierReturnRow,
    client: DatabaseQueryClient,
    forUpdate = false,
  ): Promise<SupplierReturnRecord> {
    const lines = await this.listSupplierReturnLines(row.tenant_id, row.id, client, forUpdate);

    return {
      ...mapSupplierReturnHeaderRow(row),
      lines,
    };
  }

  private async listSupplierReturnLines(
    tenantId: string,
    supplierReturnId: string,
    client: DatabaseQueryClient,
    forUpdate: boolean,
  ): Promise<readonly SupplierReturnLineRecord[]> {
    const result = await client.query<SupplierReturnLineRow>(
      `
        select ${SUPPLIER_RETURN_LINE_COLUMNS}
        from supplier_return_lines srl
        inner join products p
          on p.tenant_id = srl.tenant_id
         and p.id = srl.product_id
        where srl.tenant_id = $1::uuid
          and srl.supplier_return_id = $2::uuid
        order by srl.id asc
        ${forUpdate ? 'for update of srl' : ''}
      `,
      [tenantId, supplierReturnId],
    );

    return result.rows.map(mapSupplierReturnLineRow);
  }

  private async insertSupplierReturnLines(
    lines: readonly CreateSupplierReturnLineInput[],
    client: DatabaseQueryClient,
  ): Promise<void> {
    if (lines.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const placeholders = lines.map((line, index) => {
      const offset = index * 7;
      values.push(
        line.id,
        line.tenantId,
        line.supplierReturnId,
        line.productId,
        line.returnedQuantity,
        line.unitCost,
        line.totalCost,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::numeric(14,3),
        $${offset + 6}::numeric(14,2),
        $${offset + 7}::numeric(14,2)
      )`;
    });

    const result = await client.query(
      `
        insert into supplier_return_lines (
          id,
          tenant_id,
          supplier_return_id,
          product_id,
          returned_quantity,
          unit_cost,
          total_cost
        )
        select
          line.id,
          line.tenant_id,
          line.supplier_return_id,
          line.product_id,
          line.returned_quantity,
          line.unit_cost,
          line.total_cost
        from (
          values ${placeholders.join(', ')}
        ) as line(
          id,
          tenant_id,
          supplier_return_id,
          product_id,
          returned_quantity,
          unit_cost,
          total_cost
        )
        inner join products p
          on p.tenant_id = line.tenant_id
         and p.id = line.product_id
      `,
      values,
    );

    if (result.rowCount !== lines.length) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'lines.product_id',
          code: 'unknown_product',
          message: 'Every supplier return product must belong to the tenant.',
        },
      ]);
    }
  }
}

function mapSupplierReturnHeaderRow(row: SupplierReturnRow): Omit<SupplierReturnRecord, 'lines'> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    branchStatus: mapBranchStatus(row.branch_status),
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierStatus: mapSupplierStatus(row.supplier_status),
    originalReceivingId: row.original_receiving_id,
    status: mapSupplierReturnStatus(row.status),
    reason: row.reason,
    financialValue: row.financial_value,
    supplierCreditId: row.supplier_credit_id,
    postedAt: row.posted_at === null ? null : toDate(row.posted_at),
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

function mapSupplierReturnLineRow(row: SupplierReturnLineRow): SupplierReturnLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    supplierReturnId: row.supplier_return_id,
    productId: row.product_id,
    productName: row.product_name,
    returnedQuantity: row.returned_quantity,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
  };
}

function mapReceivingTraceLineRow(row: ReceivingTraceRow): ReceivingTraceLineRecord {
  return {
    receivingLineId: row.receiving_line_id,
    productId: row.product_id,
    receivedQuantity: row.received_quantity,
    receivedUnitCost: row.received_unit_cost,
    alreadyReturnedQuantity: row.already_returned_quantity,
  };
}

function mapSupplierCreditRow(row: SupplierCreditRow): SupplierCreditRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    supplierId: row.supplier_id,
    branchId: row.branch_id,
    amount: row.amount,
    reason: row.reason,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

function mapSupplierReturnStatus(value: string): SupplierReturnStatus {
  if (value === 'draft' || value === 'posted' || value === 'cancelled') {
    return value;
  }

  throw new Error(`Unknown supplier return status: ${value}.`);
}

function mapBranchStatus(value: string): SupplierReturnBranchStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }

  throw new Error(`Unknown supplier return branch status: ${value}.`);
}

function mapSupplierStatus(value: string): SupplierReturnSupplierStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }

  throw new Error(`Unknown supplier return supplier status: ${value}.`);
}

function mapPaymentTerms(value: string): 'cash' | 'credit' {
  if (value === 'cash' || value === 'credit') {
    return value;
  }

  throw new Error(`Unknown purchase payment terms: ${value}.`);
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Supplier return repository failed to ${operation}.`);
  }

  return row;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
