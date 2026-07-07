import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  ExpenseStore,
  type CreateExpenseInput,
  type CreateExpenseStatusEventInput,
  type ExpensePaymentMethod,
  type ExpenseRecord,
  type ExpenseReferenceRecord,
  type ListExpensesInput,
  type UpdateExpenseInput,
  type VoidExpenseInput,
} from '../application/expense.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface ExpenseRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly category_id: string;
  readonly category_name: string | null;
  readonly expense_date: Date | string;
  readonly amount: string;
  readonly payment_method: string;
  readonly reference_number: string | null;
  readonly description: string;
  readonly status: string;
  readonly void_reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly updated_by_user_id: string | null;
  readonly lock_version: number;
}

interface ExpenseReferenceRow extends DatabaseRow {
  readonly branch_id: string;
  readonly branch_status: 'active' | 'inactive';
  readonly category_id: string;
  readonly category_status: 'active' | 'inactive';
}

@Injectable()
export class PostgresExpenseRepository extends ExpenseStore {
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

  async listExpenses(
    input: ListExpensesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ExpenseRecord[]> {
    const values: unknown[] = [
      input.tenantId,
      input.branchIds,
      input.categoryId,
      input.status,
      input.fromDate,
      input.toDate,
    ];
    const predicates = [
      'e.tenant_id = $1::uuid',
      '($2::uuid[] is null or e.branch_id = any($2::uuid[]))',
      '($3::uuid is null or e.category_id = $3::uuid)',
      "($4::text = 'all' or e.status = $4::text)",
      '($5::date is null or e.expense_date >= $5::date)',
      '($6::date is null or e.expense_date <= $6::date)',
    ];

    if (input.cursor !== null) {
      values.push(input.cursor.expenseDate, input.cursor.id);
      predicates.push(
        `(e.expense_date, e.id) < ($${values.length - 1}::date, $${values.length}::uuid)`,
      );
    }

    values.push(input.limit);

    const result = await client.query<ExpenseRow>(
      `
        ${expenseSelectSql()}
        where ${predicates.join('\n          and ')}
        order by e.expense_date desc, e.id desc
        limit $${values.length}
      `,
      values,
    );

    return result.rows.map(toExpenseRecord);
  }

  async findExpenseById(
    tenantId: string,
    expenseId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `
        ${expenseSelectSql()}
        where e.tenant_id = $1::uuid
          and e.id = $2::uuid
        limit 1
      `,
      [tenantId, expenseId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toExpenseRecord(row);
  }

  async lockExpenseById(
    tenantId: string,
    expenseId: string,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `
        ${expenseSelectSql()}
        where e.tenant_id = $1::uuid
          and e.id = $2::uuid
        for update of e
      `,
      [tenantId, expenseId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toExpenseRecord(row);
  }

  async findExpenseReference(
    tenantId: string,
    branchId: string,
    categoryId: string,
    client: DatabaseQueryClient,
  ): Promise<ExpenseReferenceRecord | null> {
    const result = await client.query<ExpenseReferenceRow>(
      `
        select
          b.id as branch_id,
          b.status as branch_status,
          ec.id as category_id,
          ec.status as category_status
        from branches b
        cross join expense_categories ec
        where b.tenant_id = $1::uuid
          and b.id = $2::uuid
          and ec.tenant_id = $1::uuid
          and ec.id = $3::uuid
        limit 1
      `,
      [tenantId, branchId, categoryId],
    );

    const row = result.rows[0];

    return row === undefined
      ? null
      : {
          branchId: row.branch_id,
          branchStatus: row.branch_status,
          categoryId: row.category_id,
          categoryStatus: row.category_status,
        };
  }

  async createExpense(
    input: CreateExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord> {
    const result = await client.query<ExpenseRow>(
      `
        insert into expenses (
          id,
          tenant_id,
          branch_id,
          category_id,
          expense_date,
          amount,
          payment_method,
          reference_number,
          description,
          status,
          created_by_user_id,
          created_at,
          updated_at,
          updated_by_user_id
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'active',
          $10,
          $11,
          $11,
          $10
        )
        returning id
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.categoryId,
        input.expenseDate,
        input.amount,
        input.paymentMethod,
        input.referenceNumber,
        input.description,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    const id = result.rows[0]?.id;

    if (id === undefined) {
      throw new Error('expense create did not return a row.');
    }

    const created = await this.findExpenseById(input.tenantId, id, client);

    if (created === null) {
      throw new Error('expense create could not reload created row.');
    }

    return created;
  }

  async updateExpense(
    input: UpdateExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `
        update expenses
        set
          branch_id = $3,
          category_id = $4,
          expense_date = $5,
          amount = $6,
          payment_method = $7,
          reference_number = $8,
          description = $9,
          updated_at = $10,
          updated_by_user_id = $11,
          lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'active'
          and lock_version = $12
        returning id
      `,
      [
        input.tenantId,
        input.expenseId,
        input.branchId,
        input.categoryId,
        input.expenseDate,
        input.amount,
        input.paymentMethod,
        input.referenceNumber,
        input.description,
        input.updatedAt,
        input.updatedByUserId,
        input.expectedLockVersion,
      ],
    );

    const id = result.rows[0]?.id;

    return id === undefined ? null : this.findExpenseById(input.tenantId, id, client);
  }

  async voidExpense(
    input: VoidExpenseInput,
    client: DatabaseQueryClient,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `
        update expenses
        set
          status = 'voided',
          void_reason = $3,
          updated_at = $4,
          updated_by_user_id = $5,
          lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'active'
          and lock_version = $6
        returning id
      `,
      [
        input.tenantId,
        input.expenseId,
        input.voidReason,
        input.voidedAt,
        input.voidedByUserId,
        input.expectedLockVersion,
      ],
    );

    const id = result.rows[0]?.id;

    return id === undefined ? null : this.findExpenseById(input.tenantId, id, client);
  }

  async createExpenseStatusEvent(
    input: CreateExpenseStatusEventInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into expense_status_events (
          id,
          tenant_id,
          expense_id,
          from_status,
          to_status,
          reason,
          before_json,
          after_json,
          created_by_user_id,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
      `,
      [
        input.id,
        input.tenantId,
        input.expenseId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        JSON.stringify(input.beforeJson),
        JSON.stringify(input.afterJson),
        input.createdByUserId,
        input.createdAt,
      ],
    );
  }
}

function expenseSelectSql(): string {
  return `
    select
      e.id,
      e.tenant_id,
      e.branch_id,
      b.name as branch_name,
      e.category_id,
      ec.name as category_name,
      e.expense_date::text as expense_date,
      e.amount::numeric(14,2)::text as amount,
      e.payment_method,
      e.reference_number,
      e.description,
      e.status,
      e.void_reason,
      e.created_by_user_id,
      e.created_at,
      e.updated_at,
      e.updated_by_user_id,
      e.lock_version
    from expenses e
    left join branches b
      on b.tenant_id = e.tenant_id
     and b.id = e.branch_id
    left join expense_categories ec
      on ec.tenant_id = e.tenant_id
     and ec.id = e.category_id
  `;
}

function toExpenseRecord(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    expenseDate: normalizeDate(row.expense_date),
    amount: row.amount,
    paymentMethod: toPaymentMethod(row.payment_method),
    referenceNumber: row.reference_number,
    description: row.description,
    status: toExpenseStatus(row.status),
    voidReason: row.void_reason,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    updatedByUserId: row.updated_by_user_id,
    lockVersion: row.lock_version,
  };
}

function toExpenseStatus(value: string): 'active' | 'voided' {
  if (value === 'active' || value === 'voided') {
    return value;
  }

  throw new Error(`Unknown expense status: ${value}.`);
}

function toPaymentMethod(value: string): ExpensePaymentMethod {
  if (
    value === 'cash' ||
    value === 'gcash' ||
    value === 'maya' ||
    value === 'bank_transfer' ||
    value === 'credit_card' ||
    value === 'check' ||
    value === 'other'
  ) {
    return value;
  }

  throw new Error(`Unknown expense payment method: ${value}.`);
}

function normalizeDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
