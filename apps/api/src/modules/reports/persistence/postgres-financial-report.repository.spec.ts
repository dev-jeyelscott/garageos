import { describe, expect, it, vi } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresFinancialReportRepository } from './postgres-financial-report.repository';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '33333333-3333-4333-8333-333333333333';
const categoryId = '55555555-5555-4555-8555-555555555555';

describe('PostgresFinancialReportRepository', () => {
  it('summarizes only active expenses for the financial report expense basis', async () => {
    const { client, query } = createRepositoryClient();
    const repository = new PostgresFinancialReportRepository(client);

    const basis = await repository.getExpenseBasis(
      {
        tenantId,
        branchIds: [branchId],
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
      client,
    );

    expect(basis).toEqual({
      totals: {
        expenseCount: 2,
        totalAmount: '1250.00',
      },
      byCategory: [
        {
          categoryId,
          categoryName: 'Supplies',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
      byBranch: [
        {
          branchId,
          branchName: 'Main Branch',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
      byPaymentMethod: [
        {
          paymentMethod: 'cash',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(4);

    for (const [sql, parameters] of query.mock.calls) {
      expect(normalizeSql(sql)).toContain("e.status = 'active'");
      expect(parameters).toEqual([tenantId, [branchId], '2026-06-01', '2026-06-30']);
    }

    expect(normalizeSql(querySqlAt(query, 0))).toContain('expense_count');
    expect(normalizeSql(querySqlAt(query, 1))).toContain('category_name');
    expect(normalizeSql(querySqlAt(query, 2))).toContain('branch_name');
    expect(normalizeSql(querySqlAt(query, 3))).toContain('payment_method');
  });
});

function createRepositoryClient() {
  const query = vi.fn(
    async <Row extends DatabaseRow = DatabaseRow>(
      sql: string,
      _parameters?: readonly unknown[],
    ): Promise<DatabaseQueryResult<Row>> => {
      const normalizedSql = normalizeSql(sql);

      if (isPaymentMethodSummaryQuery(normalizedSql)) {
        return result<Row>([
          {
            payment_method: 'cash',
            expense_count: '2',
            total_amount: '1250.00',
          },
        ]);
      }

      if (isCategorySummaryQuery(normalizedSql)) {
        return result<Row>([
          {
            category_id: categoryId,
            category_name: 'Supplies',
            expense_count: '2',
            total_amount: '1250.00',
          },
        ]);
      }

      if (isBranchSummaryQuery(normalizedSql)) {
        return result<Row>([
          {
            branch_id: branchId,
            branch_name: 'Main Branch',
            expense_count: '2',
            total_amount: '1250.00',
          },
        ]);
      }

      if (isTotalsQuery(normalizedSql)) {
        return result<Row>([{ expense_count: '2', total_amount: '1250.00' }]);
      }

      throw new Error(`Unexpected financial report SQL in test fixture: ${normalizedSql}`);
    },
  );

  return {
    client: { query } as unknown as DatabaseQueryClient,
    query,
  };
}

function isTotalsQuery(normalizedSql: string): boolean {
  return (
    normalizedSql.includes('expense_count') &&
    normalizedSql.includes('total_amount') &&
    !normalizedSql.includes('category_name') &&
    !normalizedSql.includes('branch_name') &&
    !normalizedSql.includes('payment_method')
  );
}

function isCategorySummaryQuery(normalizedSql: string): boolean {
  return normalizedSql.includes('category_name');
}

function isBranchSummaryQuery(normalizedSql: string): boolean {
  return normalizedSql.includes('branch_name');
}

function isPaymentMethodSummaryQuery(normalizedSql: string): boolean {
  return normalizedSql.includes('payment_method');
}

function result<Row extends DatabaseRow>(rows: readonly DatabaseRow[]): DatabaseQueryResult<Row> {
  return {
    rows: rows as Row[],
    rowCount: rows.length,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function querySqlAt(
  query: ReturnType<typeof createRepositoryClient>['query'],
  index: number,
): string {
  const call = query.mock.calls[index];

  if (call === undefined) {
    throw new Error(`Expected financial report SQL call at index ${index}.`);
  }

  return call[0];
}
