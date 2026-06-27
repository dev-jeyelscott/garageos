import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  CustomerStore,
  type CreateCustomerInput,
  type CustomerDuplicateWarningRecord,
  type CustomerDuplicateWarningType,
  type CustomerRecord,
  type CustomerTagRecord,
  type FindDuplicateWarningsInput,
  type ListCustomersInput,
  type ReplaceCustomerTagAssignmentsInput,
  type UpdateCustomerInput,
  type UpsertCustomerTagInput,
} from '../application/customer.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface CustomerRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly mobile_number: string | null;
  readonly normalized_mobile: string | null;
  readonly email: string | null;
  readonly normalized_email: string | null;
  readonly address: string | null;
  readonly birthday: Date | string | null;
  readonly notes: string | null;
  readonly status: 'active' | 'merged' | 'soft_deleted';
  readonly merged_into_customer_id: string | null;
  readonly lock_version: number;
  readonly created_at: Date | string;
  readonly created_by_user_id: string | null;
  readonly updated_at: Date | string;
  readonly updated_by_user_id: string | null;
  readonly deleted_at: Date | string | null;
}

interface CustomerTagRow extends DatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
}

interface CustomerTagAssignmentRow extends DatabaseRow {
  readonly customer_id: string;
  readonly name: string;
}

interface DuplicateWarningRow extends DatabaseRow {
  readonly type: CustomerDuplicateWarningType;
  readonly customer_id: string;
  readonly name: string;
  readonly mobile_number: string | null;
  readonly email: string | null;
}

@Injectable()
export class PostgresCustomerRepository extends CustomerStore {
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

  async listCustomers(
    input: ListCustomersInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly CustomerRecord[]> {
    const result = await client.query<CustomerRow>(
      `
        select
          c.id,
          c.tenant_id,
          c.name,
          c.mobile_number,
          c.normalized_mobile,
          c.email,
          c.normalized_email,
          c.address,
          c.birthday,
          c.notes,
          c.status,
          c.merged_into_customer_id,
          c.lock_version,
          c.created_at,
          c.created_by_user_id,
          c.updated_at,
          c.updated_by_user_id,
          c.deleted_at
        from customers c
        where c.tenant_id = $1
          and c.status = 'active'
          and (
            $2::text is null
            or c.normalized_name like '%' || $2::text || '%'
            or (
              $3::text is not null
              and c.normalized_mobile like '%' || $3::text || '%'
            )
            or c.normalized_email like '%' || $2::text || '%'
            or exists (
              select 1
              from customer_tag_assignments cta
              inner join customer_tags ct
                on ct.tenant_id = cta.tenant_id
               and ct.id = cta.tag_id
               and ct.status = 'active'
              where cta.tenant_id = c.tenant_id
                and cta.customer_id = c.id
                and ct.normalized_name like '%' || $2::text || '%'
            )
            or exists (
              select 1
              from motorcycles m
              where m.tenant_id = c.tenant_id
                and m.customer_id = c.id
                and m.status = 'active'
                and (
                  m.normalized_plate_number like '%' || $2::text || '%'
                  or lower(m.model) like '%' || $2::text || '%'
                )
            )
          )
          and (
            cardinality($4::text[]) = 0
            or exists (
              select 1
              from customer_tag_assignments cta
              inner join customer_tags ct
                on ct.tenant_id = cta.tenant_id
               and ct.id = cta.tag_id
               and ct.status = 'active'
              where cta.tenant_id = c.tenant_id
                and cta.customer_id = c.id
                and ct.normalized_name = any($4::text[])
            )
          )
        order by c.updated_at desc, c.created_at desc, c.id asc
        limit $5
      `,
      [
        input.tenantId,
        input.normalizedSearch,
        input.normalizedMobileSearch,
        input.normalizedTagNames,
        input.limit,
      ],
    );

    return this.attachTags(result.rows, client);
  }

  async findCustomerById(
    tenantId: string,
    customerId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<CustomerRecord | null> {
    const result = await client.query<CustomerRow>(
      `
        select
          id,
          tenant_id,
          name,
          mobile_number,
          normalized_mobile,
          email,
          normalized_email,
          address,
          birthday,
          notes,
          status,
          merged_into_customer_id,
          lock_version,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deleted_at
        from customers
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, customerId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return this.attachTags([row], client).then((customers) => customers[0] ?? null);
  }

  async createCustomer(
    input: CreateCustomerInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerRecord> {
    const result = await client.query<CustomerRow>(
      `
        insert into customers (
          id,
          tenant_id,
          name,
          normalized_name,
          mobile_number,
          normalized_mobile,
          email,
          normalized_email,
          address,
          birthday,
          notes,
          status,
          created_at,
          created_by_user_id,
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
          $10,
          $11,
          'active',
          $12,
          $13,
          $12,
          $13
        )
        returning
          id,
          tenant_id,
          name,
          mobile_number,
          normalized_mobile,
          email,
          normalized_email,
          address,
          birthday,
          notes,
          status,
          merged_into_customer_id,
          lock_version,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deleted_at
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.mobileNumber,
        input.normalizedMobile,
        input.email,
        input.normalizedEmail,
        input.address,
        input.birthday,
        input.notes,
        input.createdAt,
        input.createdByUserId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Customer create did not return a row.');
    }

    return toCustomerRecord(row, []);
  }

  async updateCustomer(
    input: UpdateCustomerInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerRecord | null> {
    const result = await client.query<CustomerRow>(
      `
        update customers
        set
          name = $3,
          normalized_name = $4,
          mobile_number = $5,
          normalized_mobile = $6,
          email = $7,
          normalized_email = $8,
          address = $9,
          birthday = $10,
          notes = $11,
          updated_at = $12,
          updated_by_user_id = $13,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $14
        returning
          id,
          tenant_id,
          name,
          mobile_number,
          normalized_mobile,
          email,
          normalized_email,
          address,
          birthday,
          notes,
          status,
          merged_into_customer_id,
          lock_version,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deleted_at
      `,
      [
        input.tenantId,
        input.customerId,
        input.name,
        input.normalizedName,
        input.mobileNumber,
        input.normalizedMobile,
        input.email,
        input.normalizedEmail,
        input.address,
        input.birthday,
        input.notes,
        input.updatedAt,
        input.updatedByUserId,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toCustomerRecord(row, []);
  }

  async upsertCustomerTag(
    input: UpsertCustomerTagInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerTagRecord> {
    const existing = await client.query<CustomerTagRow>(
      `
        select id, name, normalized_name
        from customer_tags
        where tenant_id = $1
          and normalized_name = $2
          and status = 'active'
        limit 1
      `,
      [input.tenantId, input.normalizedName],
    );

    const existingRow = existing.rows[0];

    if (existingRow !== undefined) {
      return toCustomerTagRecord(existingRow);
    }

    const inserted = await client.query<CustomerTagRow>(
      `
        insert into customer_tags (
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at
        )
        values ($1, $2, $3, $4, 'active', $5)
        on conflict do nothing
        returning id, name, normalized_name
      `,
      [input.id, input.tenantId, input.name, input.normalizedName, input.createdAt],
    );

    const insertedRow = inserted.rows[0];

    if (insertedRow !== undefined) {
      return toCustomerTagRecord(insertedRow);
    }

    const afterConflict = await client.query<CustomerTagRow>(
      `
        select id, name, normalized_name
        from customer_tags
        where tenant_id = $1
          and normalized_name = $2
          and status = 'active'
        limit 1
      `,
      [input.tenantId, input.normalizedName],
    );

    const afterConflictRow = afterConflict.rows[0];

    if (afterConflictRow === undefined) {
      throw new Error('Customer tag upsert did not return a row.');
    }

    return toCustomerTagRecord(afterConflictRow);
  }

  async replaceCustomerTagAssignments(
    input: ReplaceCustomerTagAssignmentsInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        delete from customer_tag_assignments
        where tenant_id = $1
          and customer_id = $2
      `,
      [input.tenantId, input.customerId],
    );

    if (input.tagIds.length === 0) {
      return;
    }

    await client.query(
      `
        insert into customer_tag_assignments (
          tenant_id,
          customer_id,
          tag_id,
          created_at
        )
        select $1, $2, tag_id, $4
        from unnest($3::uuid[]) as requested_tags(tag_id)
        on conflict do nothing
      `,
      [input.tenantId, input.customerId, input.tagIds, input.createdAt],
    );
  }

  async findDuplicateWarnings(
    input: FindDuplicateWarningsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly CustomerDuplicateWarningRecord[]> {
    const result = await client.query<DuplicateWarningRow>(
      `
        select distinct on (warning_type, customer_id)
          warning_type as type,
          customer_id,
          name,
          mobile_number,
          email
        from (
          select
            'exact_mobile'::text as warning_type,
            c.id as customer_id,
            c.name,
            c.mobile_number,
            c.email
          from customers c
          where c.tenant_id = $1
            and c.status = 'active'
            and ($5::uuid is null or c.id <> $5::uuid)
            and $2::text is not null
            and c.normalized_mobile = $2::text

          union all

          select
            'exact_email'::text as warning_type,
            c.id as customer_id,
            c.name,
            c.mobile_number,
            c.email
          from customers c
          where c.tenant_id = $1
            and c.status = 'active'
            and ($5::uuid is null or c.id <> $5::uuid)
            and $3::text is not null
            and c.normalized_email = $3::text

          union all

          select
            'similar_name'::text as warning_type,
            c.id as customer_id,
            c.name,
            c.mobile_number,
            c.email
          from customers c
          where c.tenant_id = $1
            and c.status = 'active'
            and ($5::uuid is null or c.id <> $5::uuid)
            and similarity(c.normalized_name, $4::text) >= 0.4
        ) warnings
        order by warning_type, customer_id, name
        limit 10
      `,
      [
        input.tenantId,
        input.normalizedMobile,
        input.normalizedEmail,
        input.normalizedName,
        input.excludeCustomerId,
      ],
    );

    return result.rows.map((row) => ({
      type: row.type,
      customerId: row.customer_id,
      name: row.name,
      mobileNumber: row.mobile_number,
      email: row.email,
    }));
  }

  private async attachTags(
    rows: readonly CustomerRow[],
    client: DatabaseQueryClient,
  ): Promise<readonly CustomerRecord[]> {
    if (rows.length === 0) {
      return [];
    }

    const tenantId = rows[0]?.tenant_id;

    if (tenantId === undefined) {
      return rows.map((row) => toCustomerRecord(row, []));
    }

    const customerIds = rows.map((row) => row.id);
    const tagResult = await client.query<CustomerTagAssignmentRow>(
      `
        select cta.customer_id, ct.name
        from customer_tag_assignments cta
        inner join customer_tags ct
          on ct.tenant_id = cta.tenant_id
         and ct.id = cta.tag_id
         and ct.status = 'active'
        where cta.tenant_id = $1
          and cta.customer_id = any($2::uuid[])
        order by ct.normalized_name asc
      `,
      [tenantId, customerIds],
    );

    const tagsByCustomerId = new Map<string, string[]>();

    for (const tagRow of tagResult.rows) {
      const tags = tagsByCustomerId.get(tagRow.customer_id) ?? [];
      tags.push(tagRow.name);
      tagsByCustomerId.set(tagRow.customer_id, tags);
    }

    return rows.map((row) => toCustomerRecord(row, tagsByCustomerId.get(row.id) ?? []));
  }
}

function toCustomerRecord(row: CustomerRow, tags: readonly string[]): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobile_number,
    normalizedMobile: row.normalized_mobile,
    email: row.email,
    normalizedEmail: row.normalized_email,
    address: row.address,
    birthday: toDateOnly(row.birthday),
    notes: row.notes,
    status: row.status,
    mergedIntoCustomerId: row.merged_into_customer_id,
    tags,
    lockVersion: row.lock_version,
    createdAt: toDate(row.created_at),
    createdByUserId: row.created_by_user_id,
    updatedAt: toDate(row.updated_at),
    updatedByUserId: row.updated_by_user_id,
    deletedAt: toNullableDate(row.deleted_at),
  };
}

function toCustomerTagRecord(row: CustomerTagRow): CustomerTagRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(value);
}

function toDateOnly(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}
