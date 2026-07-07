import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  FinancialReportStore,
  type FinancialReportExpenseBasisInput,
  type FinancialReportExpenseBasisRecord,
  type FinancialReportExpenseBranchRecord,
  type FinancialReportExpenseCategoryRecord,
  type FinancialReportExpensePaymentMethodRecord,
  type FinancialReportExpenseTotalsRecord,
} from '../application/financial-report.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface ExpenseTotalsRow extends DatabaseRow {
  readonly expense_count: string;
  readonly total_amount: string;
}

interface ExpenseCategoryRow extends ExpenseTotalsRow {
  readonly category_id: string;
  readonly category_name: string | null;
}

interface ExpenseBranchRow extends ExpenseTotalsRow {
  readonly branch_id: string;
  readonly branch_name: string | null;
}

interface ExpensePaymentMethodRow extends ExpenseTotalsRow {
  readonly payment_method: string;
}

@Injectable()
export class PostgresFinancialReportRepository extends FinancialReportStore {
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

  async getExpenseBasis(
    input: FinancialReportExpenseBasisInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<FinancialReportExpenseBasisRecord> {
    const values = [input.tenantId, input.branchIds, input.fromDate, input.toDate];
    const predicates = expenseBasisPredicates();

    const [totalsResult, categoryResult, branchResult, paymentMethodResult] = await Promise.all([
      client.query<ExpenseTotalsRow>(
        `
          select
            count(*)::text as expense_count,
            coalesce(sum(e.amount), 0)::numeric(14,2)::text as total_amount
          from expenses e
          where ${predicates}
        `,
        values,
      ),
      client.query<ExpenseCategoryRow>(
        `
          select
            e.category_id,
            ec.name as category_name,
            count(*)::text as expense_count,
            coalesce(sum(e.amount), 0)::numeric(14,2)::text as total_amount
          from expenses e
          left join expense_categories ec
            on ec.tenant_id = e.tenant_id
           and ec.id = e.category_id
          where ${predicates}
          group by e.category_id, ec.name
          order by coalesce(sum(e.amount), 0) desc, ec.name asc, e.category_id asc
        `,
        values,
      ),
      client.query<ExpenseBranchRow>(
        `
          select
            e.branch_id,
            b.name as branch_name,
            count(*)::text as expense_count,
            coalesce(sum(e.amount), 0)::numeric(14,2)::text as total_amount
          from expenses e
          left join branches b
            on b.tenant_id = e.tenant_id
           and b.id = e.branch_id
          where ${predicates}
          group by e.branch_id, b.name
          order by coalesce(sum(e.amount), 0) desc, b.name asc, e.branch_id asc
        `,
        values,
      ),
      client.query<ExpensePaymentMethodRow>(
        `
          select
            e.payment_method,
            count(*)::text as expense_count,
            coalesce(sum(e.amount), 0)::numeric(14,2)::text as total_amount
          from expenses e
          where ${predicates}
          group by e.payment_method
          order by coalesce(sum(e.amount), 0) desc, e.payment_method asc
        `,
        values,
      ),
    ]);

    return {
      totals: mapExpenseTotalsRow(totalsResult.rows[0]),
      byCategory: categoryResult.rows.map(mapExpenseCategoryRow),
      byBranch: branchResult.rows.map(mapExpenseBranchRow),
      byPaymentMethod: paymentMethodResult.rows.map(mapExpensePaymentMethodRow),
    };
  }
}

function expenseBasisPredicates(): string {
  return `
    e.tenant_id = $1::uuid
    and ($2::uuid[] is null or e.branch_id = any($2::uuid[]))
    and ($3::date is null or e.expense_date >= $3::date)
    and ($4::date is null or e.expense_date <= $4::date)
    and e.status = 'active'
  `;
}

function mapExpenseTotalsRow(
  row: ExpenseTotalsRow | undefined,
): FinancialReportExpenseTotalsRecord {
  return {
    expenseCount: row === undefined ? 0 : Number(row.expense_count),
    totalAmount: row?.total_amount ?? '0.00',
  };
}

function mapExpenseCategoryRow(row: ExpenseCategoryRow): FinancialReportExpenseCategoryRecord {
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    expenseCount: Number(row.expense_count),
    totalAmount: row.total_amount,
  };
}

function mapExpenseBranchRow(row: ExpenseBranchRow): FinancialReportExpenseBranchRecord {
  return {
    branchId: row.branch_id,
    branchName: row.branch_name,
    expenseCount: Number(row.expense_count),
    totalAmount: row.total_amount,
  };
}

function mapExpensePaymentMethodRow(
  row: ExpensePaymentMethodRow,
): FinancialReportExpensePaymentMethodRecord {
  return {
    paymentMethod: row.payment_method,
    expenseCount: Number(row.expense_count),
    totalAmount: row.total_amount,
  };
}
