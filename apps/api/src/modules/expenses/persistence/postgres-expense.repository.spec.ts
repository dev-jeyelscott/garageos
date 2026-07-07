import { describe, expect, it, vi } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresExpenseRepository } from './postgres-expense.repository';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const EXPENSE_ID = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-06-28T00:00:00.000Z');

interface ExpenseRowForTest extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly category_id: string;
  readonly category_name: string | null;
  readonly expense_date: string;
  readonly amount: string;
  readonly payment_method: string;
  readonly reference_number: string | null;
  readonly description: string;
  readonly status: string;
  readonly void_reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly updated_by_user_id: string | null;
  readonly lock_version: number;
}

describe('PostgresExpenseRepository', () => {
  it('creates and reloads an expense through the repository SQL path', async () => {
    const { client, query } = createRepositoryClient();
    const repository = new PostgresExpenseRepository(client);

    const created = await repository.createExpense(
      {
        id: EXPENSE_ID,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        categoryId: CATEGORY_ID,
        expenseDate: '2026-06-24',
        amount: '850.00',
        paymentMethod: 'cash',
        referenceNumber: 'OR-456',
        description: 'Shop cleaning supplies.',
        createdByUserId: USER_ID,
        createdAt: NOW,
      },
      client,
    );

    expect(created).toMatchObject({
      id: EXPENSE_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      categoryId: CATEGORY_ID,
      amount: '850.00',
      paymentMethod: 'cash',
      status: 'active',
      lockVersion: 0,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('insert into expenses'),
      expect.arrayContaining([EXPENSE_ID, TENANT_ID, BRANCH_ID, CATEGORY_ID]),
    );
  });

  it('lists expenses with tenant, branch, status, date, and limit filters', async () => {
    const { client, query } = createRepositoryClient();
    const repository = new PostgresExpenseRepository(client);

    const expenses = await repository.listExpenses(
      {
        tenantId: TENANT_ID,
        branchIds: [BRANCH_ID],
        categoryId: CATEGORY_ID,
        status: 'active',
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
        limit: 51,
        cursor: null,
      },
      client,
    );

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ tenantId: TENANT_ID, branchId: BRANCH_ID });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('order by e.expense_date desc, e.id desc'),
      [TENANT_ID, [BRANCH_ID], CATEGORY_ID, 'active', '2026-06-01', '2026-06-30', 51],
    );
  });

  it('updates an active expense with optimistic locking and reloads the updated row', async () => {
    const { client } = createRepositoryClient();
    const repository = new PostgresExpenseRepository(client);

    const updated = await repository.updateExpense(
      {
        tenantId: TENANT_ID,
        expenseId: EXPENSE_ID,
        branchId: BRANCH_ID,
        categoryId: CATEGORY_ID,
        expenseDate: '2026-06-25',
        amount: '900.00',
        paymentMethod: 'gcash',
        referenceNumber: 'OR-789',
        description: 'Corrected supplies.',
        expectedLockVersion: 0,
        updatedByUserId: USER_ID,
        updatedAt: NOW,
      },
      client,
    );

    expect(updated).toMatchObject({
      expenseDate: '2026-06-25',
      amount: '900.00',
      paymentMethod: 'gcash',
      referenceNumber: 'OR-789',
      description: 'Corrected supplies.',
      updatedByUserId: USER_ID,
      lockVersion: 1,
    });
  });

  it('returns null when an update lock version is stale', async () => {
    const { client, query } = createRepositoryClient();
    const repository = new PostgresExpenseRepository(client);

    const updated = await repository.updateExpense(
      {
        tenantId: TENANT_ID,
        expenseId: EXPENSE_ID,
        branchId: BRANCH_ID,
        categoryId: CATEGORY_ID,
        expenseDate: '2026-06-25',
        amount: '900.00',
        paymentMethod: 'gcash',
        referenceNumber: 'OR-789',
        description: 'Corrected supplies.',
        expectedLockVersion: 99,
        updatedByUserId: USER_ID,
        updatedAt: NOW,
      },
      client,
    );

    expect(updated).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('voids an active expense with optimistic locking and reloads the voided row', async () => {
    const { client } = createRepositoryClient();
    const repository = new PostgresExpenseRepository(client);

    const voided = await repository.voidExpense(
      {
        tenantId: TENANT_ID,
        expenseId: EXPENSE_ID,
        expectedLockVersion: 0,
        voidReason: 'Duplicate expense.',
        voidedByUserId: USER_ID,
        voidedAt: NOW,
      },
      client,
    );

    expect(voided).toMatchObject({
      status: 'voided',
      voidReason: 'Duplicate expense.',
      updatedByUserId: USER_ID,
      lockVersion: 1,
    });
  });
});

function createRepositoryClient(initialRow: ExpenseRowForTest = createExpenseRow()) {
  let row = initialRow;

  const query = vi.fn(
    async <Row extends DatabaseRow = DatabaseRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<DatabaseQueryResult<Row>> => {
      const normalizedSql = normalizeSql(sql);

      if (normalizedSql.includes('insert into expenses')) {
        row = createExpenseRow({
          id: String(params[0]),
          tenant_id: String(params[1]),
          branch_id: String(params[2]),
          category_id: String(params[3]),
          expense_date: String(params[4]),
          amount: String(params[5]),
          payment_method: String(params[6]),
          reference_number: toNullableString(params[7]),
          description: String(params[8]),
          created_by_user_id: toNullableString(params[9]),
          created_at: toDate(params[10]),
          updated_at: toDate(params[10]),
          updated_by_user_id: toNullableString(params[9]),
        });

        return result<Row>([{ id: row.id }]);
      }

      if (normalizedSql.includes('update expenses set branch_id = $3')) {
        if (row.lock_version !== Number(params[11])) {
          return result<Row>([]);
        }

        row = createExpenseRow({
          ...row,
          branch_id: String(params[2]),
          category_id: String(params[3]),
          expense_date: String(params[4]),
          amount: String(params[5]),
          payment_method: String(params[6]),
          reference_number: toNullableString(params[7]),
          description: String(params[8]),
          updated_at: toDate(params[9]),
          updated_by_user_id: toNullableString(params[10]),
          lock_version: row.lock_version + 1,
        });

        return result<Row>([{ id: row.id }]);
      }

      if (normalizedSql.includes("update expenses set status = 'voided'")) {
        if (row.lock_version !== Number(params[5])) {
          return result<Row>([]);
        }

        row = createExpenseRow({
          ...row,
          status: 'voided',
          void_reason: String(params[2]),
          updated_at: toDate(params[3]),
          updated_by_user_id: toNullableString(params[4]),
          lock_version: row.lock_version + 1,
        });

        return result<Row>([{ id: row.id }]);
      }

      if (normalizedSql.includes('from expenses e')) {
        return result<Row>([row]);
      }

      return result<Row>([]);
    },
  );

  return {
    client: { query } as unknown as DatabaseQueryClient,
    query,
  };
}

function createExpenseRow(overrides: Partial<ExpenseRowForTest> = {}): ExpenseRowForTest {
  return {
    id: overrides.id ?? EXPENSE_ID,
    tenant_id: overrides.tenant_id ?? TENANT_ID,
    branch_id: overrides.branch_id ?? BRANCH_ID,
    branch_name: overrides.branch_name ?? 'Main Branch',
    category_id: overrides.category_id ?? CATEGORY_ID,
    category_name: overrides.category_name ?? 'Supplies',
    expense_date: overrides.expense_date ?? '2026-06-24',
    amount: overrides.amount ?? '850.00',
    payment_method: overrides.payment_method ?? 'cash',
    reference_number: overrides.reference_number ?? 'OR-456',
    description: overrides.description ?? 'Shop cleaning supplies.',
    status: overrides.status ?? 'active',
    void_reason: overrides.void_reason ?? null,
    created_by_user_id: overrides.created_by_user_id ?? USER_ID,
    created_at: overrides.created_at ?? NOW,
    updated_at: overrides.updated_at ?? NOW,
    updated_by_user_id: overrides.updated_by_user_id ?? USER_ID,
    lock_version: overrides.lock_version ?? 0,
  };
}

function result<Row extends DatabaseRow>(rows: readonly DatabaseRow[]): DatabaseQueryResult<Row> {
  return {
    rows: rows as Row[],
    rowCount: rows.length,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function toNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : NOW;
}
