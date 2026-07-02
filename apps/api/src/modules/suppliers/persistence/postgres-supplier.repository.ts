import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  SupplierStore,
  type ChangeSupplierStatusInput,
  type CreateSupplierInput,
  type CreateSupplierPaymentInput,
  type ListSuppliersInput,
  type SupplierDeactivationBlocker,
  type SupplierPaymentMethod,
  type SupplierPaymentRecord,
  type SupplierRecord,
  type UpdateSupplierInput,
} from '../application/supplier.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface SupplierRow extends DatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly contact_person: string | null;
  readonly mobile_number: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly status: 'active' | 'inactive';
  readonly lock_version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly deactivated_at: Date | string | null;
  readonly reactivated_at: Date | string | null;
}

interface SupplierPaymentRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly supplier_id: string;
  readonly amount: string;
  readonly payment_date: Date | string;
  readonly payment_method: string;
  readonly reference_number: string | null;
  readonly notes: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
}

interface SupplierBalanceRow extends DatabaseRow {
  readonly amount: string;
}

interface SupplierDeactivationBlockerRow extends DatabaseRow {
  readonly blocker: SupplierDeactivationBlocker;
}

const SUPPLIER_COLUMNS = `
  id,
  name,
  normalized_name,
  contact_person,
  mobile_number,
  email,
  address,
  notes,
  status,
  lock_version,
  created_at,
  updated_at,
  null::timestamptz as deactivated_at,
  null::timestamptz as reactivated_at
`;

@Injectable()
export class PostgresSupplierRepository extends SupplierStore {
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
          where ur.tenant_id = $1
            and ur.user_id = $2
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async listSuppliers(
    input: ListSuppliersInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly SupplierRecord[]> {
    const values: unknown[] = [input.tenantId, input.status, input.limit];
    const predicates = ['tenant_id = $1', "($2::text = 'all' or status = $2::text)"];

    if (input.normalizedSearch !== null) {
      values.push(`%${input.normalizedSearch}%`);
      predicates.push(`(
        normalized_name like $${values.length}
        or coalesce(lower(contact_person), '') like $${values.length}
        or coalesce(lower(mobile_number), '') like $${values.length}
        or coalesce(lower(email), '') like $${values.length}
      )`);
    }

    if (input.cursor !== null) {
      values.push(input.cursor.updatedAt, input.cursor.id);
      predicates.push(
        `(updated_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }

    const result = await client.query<SupplierRow>(
      `
        select ${SUPPLIER_COLUMNS}
        from suppliers
        where ${predicates.join('\n          and ')}
        order by updated_at desc, id desc
        limit $3
      `,
      values,
    );

    return result.rows.map(toSupplierRecord);
  }

  async findSupplierById(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<SupplierRecord | null> {
    const result = await client.query<SupplierRow>(
      `
        select ${SUPPLIER_COLUMNS}
        from suppliers
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, supplierId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toSupplierRecord(row);
  }

  override async lockSupplierById(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<SupplierRecord | null> {
    const result = await client.query<SupplierRow>(
      `
        select ${SUPPLIER_COLUMNS}
        from suppliers
        where tenant_id = $1::uuid
          and id = $2::uuid
        for update
      `,
      [tenantId, supplierId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toSupplierRecord(row);
  }

  async createSupplier(
    input: CreateSupplierInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord> {
    const result = await client.query<SupplierRow>(
      `
        insert into suppliers (
          id,
          tenant_id,
          name,
          normalized_name,
          contact_person,
          mobile_number,
          email,
          address,
          notes,
          status,
          created_by_user_id,
          created_at,
          updated_by_user_id,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, $10, $11)
        returning ${SUPPLIER_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.contactPerson,
        input.mobileNumber,
        input.email,
        input.address,
        input.notes,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Supplier create did not return a row.');
    }

    return toSupplierRecord(row);
  }

  async updateSupplier(
    input: UpdateSupplierInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord | null> {
    const result = await client.query<SupplierRow>(
      `
        update suppliers
        set
          name = $3,
          normalized_name = $4,
          contact_person = $5,
          mobile_number = $6,
          email = $7,
          address = $8,
          notes = $9,
          updated_by_user_id = $10,
          updated_at = $11,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and lock_version = $12
        returning ${SUPPLIER_COLUMNS}
      `,
      [
        input.tenantId,
        input.supplierId,
        input.name,
        input.normalizedName,
        input.contactPerson,
        input.mobileNumber,
        input.email,
        input.address,
        input.notes,
        input.updatedByUserId,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toSupplierRecord(row);
  }

  async changeSupplierStatus(
    input: ChangeSupplierStatusInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord | null> {
    const lockPredicate = input.expectedLockVersion === null ? '' : 'and lock_version = $6';
    const result = await client.query<SupplierRow>(
      `
        update suppliers
        set
          status = $4,
          updated_by_user_id = $5,
          updated_at = $7,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = $3
          ${lockPredicate}
        returning ${SUPPLIER_COLUMNS}
      `,
      [
        input.tenantId,
        input.supplierId,
        input.fromStatus,
        input.toStatus,
        input.changedByUserId,
        input.expectedLockVersion,
        input.changedAt,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toSupplierRecord(row);
  }

  async findSupplierDeactivationBlockers(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly SupplierDeactivationBlocker[]> {
    const result = await client.query<SupplierDeactivationBlockerRow>(
      `
        with supplier_balance as (
          select
            coalesce((
              select sum(amount_delta)
              from supplier_payables
              where tenant_id = $1
                and supplier_id = $2
            ), 0)
            - coalesce((
              select sum(amount)
              from supplier_payments
              where tenant_id = $1
                and supplier_id = $2
            ), 0)
            - coalesce((
              select sum(amount)
              from supplier_credits
              where tenant_id = $1
                and supplier_id = $2
            ), 0) as amount
        )
        select blocker
        from (
          select 'open_purchase_orders' as blocker
          where exists (
            select 1
            from purchase_orders
            where tenant_id = $1
              and supplier_id = $2
              and status in ('draft', 'ordered', 'partially_received')
          )

          union all

          select 'unpaid_accounts_payable' as blocker
          where (select amount from supplier_balance) > 0
        ) blockers
      `,
      [tenantId, supplierId],
    );

    return result.rows.map((row) => row.blocker);
  }

  override async getSupplierPayableBalanceForUpdate(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<string> {
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

  override async createSupplierPayment(
    input: CreateSupplierPaymentInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<SupplierPaymentRecord> {
    const result = await client.query<SupplierPaymentRow>(
      `
        insert into supplier_payments (
          id,
          tenant_id,
          supplier_id,
          amount,
          payment_date,
          payment_method,
          reference_number,
          notes,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::numeric(14,2),
          $5::date,
          $6,
          $7,
          $8,
          $9::uuid,
          $10::timestamptz
        )
        returning
          id,
          tenant_id,
          supplier_id,
          amount::text,
          payment_date,
          payment_method,
          reference_number,
          notes,
          created_by_user_id,
          created_at
      `,
      [
        input.id,
        input.tenantId,
        input.supplierId,
        input.amount,
        input.paymentDate,
        input.paymentMethod,
        input.referenceNumber,
        input.notes,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Supplier payment create did not return a row.');
    }

    return toSupplierPaymentRecord(row);
  }
}

function toSupplierRecord(row: SupplierRow): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    contactPerson: row.contact_person,
    mobileNumber: row.mobile_number,
    email: row.email,
    address: row.address,
    notes: row.notes,
    status: row.status,
    lockVersion: Number(row.lock_version),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deactivatedAt: row.deactivated_at === null ? null : toDate(row.deactivated_at),
    reactivatedAt: row.reactivated_at === null ? null : toDate(row.reactivated_at),
  };
}

function toSupplierPaymentRecord(row: SupplierPaymentRow): SupplierPaymentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    supplierId: row.supplier_id,
    amount: row.amount,
    paymentDate: toDateOnlyString(row.payment_date),
    paymentMethod: toSupplierPaymentMethod(row.payment_method),
    referenceNumber: row.reference_number,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

function toSupplierPaymentMethod(value: string): SupplierPaymentMethod {
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

  throw new Error(`Unknown supplier payment method: ${value}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOnlyString(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
