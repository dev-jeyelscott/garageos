import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
} from '../../../shared/database/database-client';
import {
  ACCOUNTS_RECEIVABLE_AGING_BUCKETS,
  type AccountsReceivableAgingBucket,
  type AccountsReceivableInvoiceRecord,
  type AccountsReceivableSummaryRecord,
} from '../application/accounts-receivable.records';
import {
  AccountsReceivableStore,
  type ListAccountsReceivableInput,
  type SummarizeAccountsReceivableInput,
} from '../application/accounts-receivable.store';
import type { InvoiceStatus } from '../application/invoice.records';

interface AccountsReceivableRow {
  readonly invoice_id: string;
  readonly invoice_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly branch_id: string;
  readonly invoice_total: string;
  readonly amount_paid: string;
  readonly remaining_collectible_balance: string;
  readonly due_date: string | null;
  readonly status: InvoiceStatus;
  readonly aging_bucket: AccountsReceivableAgingBucket;
}

interface AccountsReceivableSummaryRow {
  readonly aging_bucket: AccountsReceivableAgingBucket;
  readonly invoice_count: string | number;
  readonly remaining_collectible_balance: string;
}

const ACCOUNTS_RECEIVABLE_STATUS_SQL = "'pending', 'partially_paid', 'overdue'";

const AGING_BUCKET_SQL = `
  case
    when due_date is null or due_date >= as_of_date then '${ACCOUNTS_RECEIVABLE_AGING_BUCKETS.CURRENT}'
    when as_of_date - due_date between 1 and 30 then '${ACCOUNTS_RECEIVABLE_AGING_BUCKETS.DAYS_1_30_OVERDUE}'
    when as_of_date - due_date between 31 and 60 then '${ACCOUNTS_RECEIVABLE_AGING_BUCKETS.DAYS_31_60_OVERDUE}'
    when as_of_date - due_date between 61 and 90 then '${ACCOUNTS_RECEIVABLE_AGING_BUCKETS.DAYS_61_90_OVERDUE}'
    else '${ACCOUNTS_RECEIVABLE_AGING_BUCKETS.OVER_90_DAYS_OVERDUE}'
  end
`;

@Injectable()
export class PostgresAccountsReceivableStore extends AccountsReceivableStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: { tenantId: string; userId: string }): Promise<boolean> {
    const result = await this.database.query<{ value: number }>(
      `
        select 1 as value
        from user_roles ur
        join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
        where ur.tenant_id = $1::uuid
          and ur.user_id = $2::uuid
          and ur.removed_at is null
          and r.status = 'active'
          and r.role_type = 'shop_owner'
        limit 1
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0] !== undefined;
  }

  async listAccountsReceivable(
    input: ListAccountsReceivableInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly AccountsReceivableInvoiceRecord[]> {
    const result = await client.query<AccountsReceivableRow>(
      `
        with ar_base as (
          select
            i.id as invoice_id,
            i.invoice_number,
            i.customer_id,
            c.name as customer_name,
            i.branch_id,
            i.total_amount::numeric(14,2)::text as invoice_total,
            greatest(i.amount_paid - i.amount_refunded, 0)::numeric(14,2)::text as amount_paid,
            i.remaining_collectible_balance::numeric(14,2)::text as remaining_collectible_balance,
            i.due_date::text as due_date,
            i.status,
            coalesce($8::date, (now() at time zone t.timezone)::date) as as_of_date
          from invoices i
          join tenants t on t.id = i.tenant_id
          join customers c on c.tenant_id = i.tenant_id and c.id = i.customer_id
          where i.tenant_id = $1::uuid
            and i.remaining_collectible_balance > 0
            and i.status in (${ACCOUNTS_RECEIVABLE_STATUS_SQL})
            and ($2::uuid[] is null or i.branch_id = any($2::uuid[]))
            and ($3::uuid is null or i.branch_id = $3::uuid)
            and ($4::uuid is null or i.customer_id = $4::uuid)
            and ($5::text is null or i.status = $5::text)
            and ($6::date is null or i.invoice_date >= $6::date)
            and ($7::date is null or i.invoice_date <= $7::date)
        )
        select
          invoice_id,
          invoice_number,
          customer_id,
          customer_name,
          branch_id,
          invoice_total,
          amount_paid,
          remaining_collectible_balance,
          due_date,
          status,
          ${AGING_BUCKET_SQL} as aging_bucket
        from ar_base
        order by due_date asc nulls last, invoice_number asc, invoice_id asc
        limit $9
      `,
      [
        input.tenantId,
        input.branchIds,
        input.branchId,
        input.customerId,
        input.status,
        input.fromDate,
        input.toDate,
        input.asOfDate,
        input.limit,
      ],
    );

    return result.rows.map(mapAccountsReceivableRow);
  }

  async summarizeAccountsReceivable(
    input: SummarizeAccountsReceivableInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly AccountsReceivableSummaryRecord[]> {
    const result = await client.query<AccountsReceivableSummaryRow>(
      `
        with ar_base as (
          select
            i.remaining_collectible_balance,
            i.due_date,
            coalesce($7::date, (now() at time zone t.timezone)::date) as as_of_date
          from invoices i
          join tenants t on t.id = i.tenant_id
          where i.tenant_id = $1::uuid
            and i.remaining_collectible_balance > 0
            and i.status in (${ACCOUNTS_RECEIVABLE_STATUS_SQL})
            and ($2::uuid[] is null or i.branch_id = any($2::uuid[]))
            and ($3::uuid is null or i.branch_id = $3::uuid)
            and ($4::uuid is null or i.customer_id = $4::uuid)
            and ($5::date is null or i.invoice_date >= $5::date)
            and ($6::date is null or i.invoice_date <= $6::date)
        ), ar_bucketed as (
          select
            ${AGING_BUCKET_SQL} as aging_bucket,
            remaining_collectible_balance
          from ar_base
        )
        select
          aging_bucket,
          count(*)::integer as invoice_count,
          coalesce(sum(remaining_collectible_balance), 0)::numeric(14,2)::text as remaining_collectible_balance
        from ar_bucketed
        group by aging_bucket
      `,
      [
        input.tenantId,
        input.branchIds,
        input.branchId,
        input.customerId,
        input.fromDate,
        input.toDate,
        input.asOfDate,
      ],
    );

    return result.rows.map(mapAccountsReceivableSummaryRow);
  }
}

function mapAccountsReceivableRow(row: AccountsReceivableRow): AccountsReceivableInvoiceRecord {
  return {
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    branchId: row.branch_id,
    invoiceTotal: row.invoice_total,
    amountPaid: row.amount_paid,
    remainingCollectibleBalance: row.remaining_collectible_balance,
    dueDate: row.due_date,
    status: row.status,
    agingBucket: row.aging_bucket,
  };
}

function mapAccountsReceivableSummaryRow(
  row: AccountsReceivableSummaryRow,
): AccountsReceivableSummaryRecord {
  return {
    agingBucket: row.aging_bucket,
    invoiceCount: Number(row.invoice_count),
    remainingCollectibleBalance: row.remaining_collectible_balance,
  };
}
