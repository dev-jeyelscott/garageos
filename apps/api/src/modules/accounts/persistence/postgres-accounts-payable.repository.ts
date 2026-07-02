import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  AccountsPayableStore,
  type AccountsPayableBranchBasisRecord,
  type AccountsPayableBranchStatus,
  type AccountsPayableSupplierBasisRecord,
  type AccountsPayableSupplierStatus,
  type GetAccountsPayableSummaryInput,
  type ListAccountsPayableInput,
} from '../application/accounts-payable.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface SupplierBalanceRow extends DatabaseRow {
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly supplier_status: string;
  readonly credit_purchase_received_total: string;
  readonly supplier_payment_total: string;
  readonly supplier_credit_total: string;
  readonly last_activity_at: Date | string;
}

interface BranchBalanceRow extends DatabaseRow {
  readonly branch_id: string;
  readonly branch_name: string;
  readonly branch_status: string;
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly credit_purchase_received_total: string;
  readonly supplier_credit_total: string;
  readonly last_activity_at: Date | string;
}

@Injectable()
export class PostgresAccountsPayableRepository extends AccountsPayableStore {
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

  async listSupplierBalances(
    input: ListAccountsPayableInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly AccountsPayableSupplierBasisRecord[]> {
    const rows =
      input.reportScope === 'tenant'
        ? await this.listTenantSupplierBalances(input, client, input.limit)
        : await this.listBranchSourceSupplierBalances(input, client, input.limit);

    return rows.map(mapSupplierBalanceRow);
  }

  async getSummaryBasis(
    input: GetAccountsPayableSummaryInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<{
    readonly suppliers: readonly AccountsPayableSupplierBasisRecord[];
    readonly branches: readonly AccountsPayableBranchBasisRecord[];
  }> {
    const supplierRows =
      input.reportScope === 'tenant'
        ? await this.listTenantSupplierBalances({ ...input, limit: 0, cursor: null }, client, null)
        : await this.listBranchSourceSupplierBalances(
            { ...input, limit: 0, cursor: null },
            client,
            null,
          );
    const branchRows = await this.listBranchSourceBalances(input, client);

    return {
      suppliers: supplierRows.map(mapSupplierBalanceRow),
      branches: branchRows.map(mapBranchBalanceRow),
    };
  }

  private async listTenantSupplierBalances(
    input: ListAccountsPayableInput,
    client: DatabaseQueryClient,
    limit: number | null,
  ): Promise<readonly SupplierBalanceRow[]> {
    const values: unknown[] = [input.tenantId, input.supplierId, input.includeZero];
    const predicates = [
      's.tenant_id = $1::uuid',
      '($2::uuid is null or s.id = $2::uuid)',
      `(
        $3::boolean = true
        or (
          coalesce(pt.credit_purchase_received_total, 0)
          - coalesce(pmt.supplier_payment_total, 0)
          - coalesce(ct.supplier_credit_total, 0)
        ) <> 0
      )`,
    ];

    if (input.cursor !== null) {
      values.push(input.cursor.lastActivityAt, input.cursor.supplierId);
      predicates.push(
        `(coalesce(la.last_activity_at, s.updated_at), s.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }

    const limitClause = appendLimitClause(values, limit);
    const result = await client.query<SupplierBalanceRow>(
      `
        with payable_totals as (
          select
            supplier_id,
            sum(amount_delta)::numeric(14,2) as credit_purchase_received_total,
            max(occurred_at) as last_activity_at
          from supplier_payables
          where tenant_id = $1::uuid
          group by supplier_id
        ),
        payment_totals as (
          select
            supplier_id,
            sum(amount)::numeric(14,2) as supplier_payment_total,
            max(created_at) as last_activity_at
          from supplier_payments
          where tenant_id = $1::uuid
          group by supplier_id
        ),
        credit_totals as (
          select
            supplier_id,
            sum(amount)::numeric(14,2) as supplier_credit_total,
            max(created_at) as last_activity_at
          from supplier_credits
          where tenant_id = $1::uuid
          group by supplier_id
        ),
        source_supplier_ids as (
          select supplier_id from payable_totals
          union
          select supplier_id from payment_totals
          union
          select supplier_id from credit_totals
          union
          select id as supplier_id
          from suppliers
          where tenant_id = $1::uuid
            and $3::boolean = true
        ),
        last_activity as (
          select
            supplier_id,
            max(last_activity_at) as last_activity_at
          from (
            select supplier_id, last_activity_at from payable_totals
            union all
            select supplier_id, last_activity_at from payment_totals
            union all
            select supplier_id, last_activity_at from credit_totals
          ) activity
          group by supplier_id
        )
        select
          s.id as supplier_id,
          s.name as supplier_name,
          s.status as supplier_status,
          coalesce(pt.credit_purchase_received_total, 0)::numeric(14,2)::text as credit_purchase_received_total,
          coalesce(pmt.supplier_payment_total, 0)::numeric(14,2)::text as supplier_payment_total,
          coalesce(ct.supplier_credit_total, 0)::numeric(14,2)::text as supplier_credit_total,
          coalesce(la.last_activity_at, s.updated_at) as last_activity_at
        from source_supplier_ids source
        inner join suppliers s
          on s.tenant_id = $1::uuid
         and s.id = source.supplier_id
        left join payable_totals pt
          on pt.supplier_id = s.id
        left join payment_totals pmt
          on pmt.supplier_id = s.id
        left join credit_totals ct
          on ct.supplier_id = s.id
        left join last_activity la
          on la.supplier_id = s.id
        where ${predicates.join('\n          and ')}
        order by coalesce(la.last_activity_at, s.updated_at) desc, s.id desc
        ${limitClause}
      `,
      values,
    );

    return result.rows;
  }

  private async listBranchSourceSupplierBalances(
    input: ListAccountsPayableInput,
    client: DatabaseQueryClient,
    limit: number | null,
  ): Promise<readonly SupplierBalanceRow[]> {
    const branchIds = input.branchIds ?? [];
    const values: unknown[] = [input.tenantId, branchIds, input.supplierId, input.includeZero];
    const predicates = [
      's.tenant_id = $1::uuid',
      '($3::uuid is null or s.id = $3::uuid)',
      `(
        $4::boolean = true
        or (
          coalesce(pt.credit_purchase_received_total, 0)
          - coalesce(ct.supplier_credit_total, 0)
        ) <> 0
      )`,
    ];

    if (input.cursor !== null) {
      values.push(input.cursor.lastActivityAt, input.cursor.supplierId);
      predicates.push(
        `(coalesce(la.last_activity_at, s.updated_at), s.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }

    const limitClause = appendLimitClause(values, limit);
    const result = await client.query<SupplierBalanceRow>(
      `
        with payable_totals as (
          select
            supplier_id,
            sum(amount_delta)::numeric(14,2) as credit_purchase_received_total,
            max(occurred_at) as last_activity_at
          from supplier_payables
          where tenant_id = $1::uuid
            and branch_id = any($2::uuid[])
          group by supplier_id
        ),
        credit_totals as (
          select
            supplier_id,
            sum(amount)::numeric(14,2) as supplier_credit_total,
            max(created_at) as last_activity_at
          from supplier_credits
          where tenant_id = $1::uuid
            and branch_id = any($2::uuid[])
          group by supplier_id
        ),
        source_supplier_ids as (
          select supplier_id from payable_totals
          union
          select supplier_id from credit_totals
        ),
        last_activity as (
          select
            supplier_id,
            max(last_activity_at) as last_activity_at
          from (
            select supplier_id, last_activity_at from payable_totals
            union all
            select supplier_id, last_activity_at from credit_totals
          ) activity
          group by supplier_id
        )
        select
          s.id as supplier_id,
          s.name as supplier_name,
          s.status as supplier_status,
          coalesce(pt.credit_purchase_received_total, 0)::numeric(14,2)::text as credit_purchase_received_total,
          '0.00' as supplier_payment_total,
          coalesce(ct.supplier_credit_total, 0)::numeric(14,2)::text as supplier_credit_total,
          coalesce(la.last_activity_at, s.updated_at) as last_activity_at
        from source_supplier_ids source
        inner join suppliers s
          on s.tenant_id = $1::uuid
         and s.id = source.supplier_id
        left join payable_totals pt
          on pt.supplier_id = s.id
        left join credit_totals ct
          on ct.supplier_id = s.id
        left join last_activity la
          on la.supplier_id = s.id
        where ${predicates.join('\n          and ')}
        order by coalesce(la.last_activity_at, s.updated_at) desc, s.id desc
        ${limitClause}
      `,
      values,
    );

    return result.rows;
  }

  private async listBranchSourceBalances(
    input: GetAccountsPayableSummaryInput,
    client: DatabaseQueryClient,
  ): Promise<readonly BranchBalanceRow[]> {
    const values: unknown[] = [input.tenantId, input.supplierId, input.includeZero];
    const payableBranchPredicate =
      input.branchIds === null ? '' : 'and branch_id = any($4::uuid[])';
    const creditBranchPredicate = input.branchIds === null ? '' : 'and branch_id = any($4::uuid[])';
    const sourceBranchPredicate = input.branchIds === null ? '' : 'and b.id = any($4::uuid[])';

    if (input.branchIds !== null) {
      values.push(input.branchIds);
    }

    const result = await client.query<BranchBalanceRow>(
      `
        with payable_totals as (
          select
            branch_id,
            supplier_id,
            sum(amount_delta)::numeric(14,2) as credit_purchase_received_total,
            max(occurred_at) as last_activity_at
          from supplier_payables
          where tenant_id = $1::uuid
            and branch_id is not null
            ${payableBranchPredicate}
          group by branch_id, supplier_id
        ),
        credit_totals as (
          select
            branch_id,
            supplier_id,
            sum(amount)::numeric(14,2) as supplier_credit_total,
            max(created_at) as last_activity_at
          from supplier_credits
          where tenant_id = $1::uuid
            and branch_id is not null
            ${creditBranchPredicate}
          group by branch_id, supplier_id
        ),
        source_rows as (
          select branch_id, supplier_id from payable_totals
          union
          select branch_id, supplier_id from credit_totals
        )
        select
          b.id as branch_id,
          b.name as branch_name,
          b.status as branch_status,
          s.id as supplier_id,
          s.name as supplier_name,
          coalesce(pt.credit_purchase_received_total, 0)::numeric(14,2)::text as credit_purchase_received_total,
          coalesce(ct.supplier_credit_total, 0)::numeric(14,2)::text as supplier_credit_total,
          greatest(
            coalesce(pt.last_activity_at, '-infinity'::timestamptz),
            coalesce(ct.last_activity_at, '-infinity'::timestamptz)
          ) as last_activity_at
        from source_rows source
        inner join branches b
          on b.tenant_id = $1::uuid
         and b.id = source.branch_id
        inner join suppliers s
          on s.tenant_id = $1::uuid
         and s.id = source.supplier_id
        left join payable_totals pt
          on pt.branch_id = source.branch_id
         and pt.supplier_id = source.supplier_id
        left join credit_totals ct
          on ct.branch_id = source.branch_id
         and ct.supplier_id = source.supplier_id
        where ($2::uuid is null or s.id = $2::uuid)
          and (
            $3::boolean = true
            or (coalesce(pt.credit_purchase_received_total, 0) - coalesce(ct.supplier_credit_total, 0)) <> 0
          )
          ${sourceBranchPredicate}
        order by last_activity_at desc, b.id desc, s.id desc
      `,
      values,
    );

    return result.rows;
  }
}

function appendLimitClause(values: unknown[], limit: number | null): string {
  if (limit === null) {
    return '';
  }

  values.push(limit);

  return `limit $${values.length}`;
}

function mapSupplierBalanceRow(row: SupplierBalanceRow): AccountsPayableSupplierBasisRecord {
  return {
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierStatus: mapSupplierStatus(row.supplier_status),
    creditPurchaseReceivedTotal: row.credit_purchase_received_total,
    supplierPaymentTotal: row.supplier_payment_total,
    supplierCreditTotal: row.supplier_credit_total,
    lastActivityAt: toDate(row.last_activity_at),
  };
}

function mapBranchBalanceRow(row: BranchBalanceRow): AccountsPayableBranchBasisRecord {
  return {
    branchId: row.branch_id,
    branchName: row.branch_name,
    branchStatus: mapBranchStatus(row.branch_status),
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    creditPurchaseReceivedTotal: row.credit_purchase_received_total,
    supplierCreditTotal: row.supplier_credit_total,
    lastActivityAt: toDate(row.last_activity_at),
  };
}

function mapSupplierStatus(value: string): AccountsPayableSupplierStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }

  throw new Error(`Unknown supplier status for accounts payable: ${value}.`);
}

function mapBranchStatus(value: string): AccountsPayableBranchStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }

  throw new Error(`Unknown branch status for accounts payable: ${value}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
