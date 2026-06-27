import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  ServiceStore,
  type ChangeServiceStatusInput,
  type CreateServiceInput,
  type ListServicesInput,
  type ServiceDeactivationBlocker,
  type ServiceRecord,
  type UpdateServiceInput,
} from '../application/service.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface RegclassRow extends DatabaseRow {
  readonly value: string | null;
}

interface ServiceRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly starting_price: string | number;
  readonly variable_price: boolean;
  readonly price_disclaimer: string | null;
  readonly description: string | null;
  readonly status: 'active' | 'inactive';
  readonly deactivated_at: Date | string | null;
  readonly reactivated_at: Date | string | null;
  readonly created_at: Date | string;
  readonly created_by_user_id: string | null;
  readonly updated_at: Date | string;
  readonly updated_by_user_id: string | null;
  readonly lock_version: number;
}

@Injectable()
export class PostgresServiceRepository extends ServiceStore {
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

  async listServices(
    input: ListServicesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ServiceRecord[]> {
    const result = await client.query<ServiceRow>(
      `
        select
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
          status,
          deactivated_at,
          reactivated_at,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          lock_version
        from services
        where tenant_id = $1
          and ($2::text = 'all' or status = $2::text)
          and (
            $3::text is null
            or normalized_name like '%' || $3::text || '%'
            or lower(coalesce(description, '')) like '%' || $3::text || '%'
          )
        order by updated_at desc, created_at desc, id asc
        limit $4
      `,
      [input.tenantId, input.status, input.normalizedSearch, input.limit],
    );

    return result.rows.map(toServiceRecord);
  }

  async findServiceById(
    tenantId: string,
    serviceId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ServiceRecord | null> {
    const result = await client.query<ServiceRow>(
      `
        select
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
          status,
          deactivated_at,
          reactivated_at,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          lock_version
        from services
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, serviceId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toServiceRecord(row);
  }

  async createService(
    input: CreateServiceInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord> {
    const result = await client.query<ServiceRow>(
      `
        insert into services (
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
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
          'active',
          $9,
          $10,
          $9,
          $10
        )
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
          status,
          deactivated_at,
          reactivated_at,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          lock_version
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.startingPrice,
        input.variablePrice,
        input.priceDisclaimer,
        input.description,
        input.createdAt,
        input.createdByUserId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Service create did not return a row.');
    }

    return toServiceRecord(row);
  }

  async updateService(
    input: UpdateServiceInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord | null> {
    const result = await client.query<ServiceRow>(
      `
        update services
        set
          name = $3,
          normalized_name = $4,
          starting_price = $5,
          variable_price = $6,
          price_disclaimer = $7,
          description = $8,
          updated_at = $9,
          updated_by_user_id = $10,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $11
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
          status,
          deactivated_at,
          reactivated_at,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          lock_version
      `,
      [
        input.tenantId,
        input.serviceId,
        input.name,
        input.normalizedName,
        input.startingPrice,
        input.variablePrice,
        input.priceDisclaimer,
        input.description,
        input.updatedAt,
        input.updatedByUserId,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toServiceRecord(row);
  }

  async changeServiceStatus(
    input: ChangeServiceStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord | null> {
    const result = await client.query<ServiceRow>(
      `
        update services
        set
          status = $4,
          deactivated_at = case when $4::text = 'inactive' then $6 else deactivated_at end,
          reactivated_at = case when $4::text = 'active' then $6 else reactivated_at end,
          updated_at = $6,
          updated_by_user_id = $7,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = $3
          and lock_version = $5
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          starting_price,
          variable_price,
          price_disclaimer,
          description,
          status,
          deactivated_at,
          reactivated_at,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          lock_version
      `,
      [
        input.tenantId,
        input.serviceId,
        input.fromStatus,
        input.toStatus,
        input.expectedLockVersion,
        input.changedAt,
        input.changedByUserId,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toServiceRecord(row);
  }

  async findServiceDeactivationBlockers(
    tenantId: string,
    serviceId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ServiceDeactivationBlocker[]> {
    const blockers = new Set<ServiceDeactivationBlocker>();

    if (
      (await this.tableExists('job_orders', client)) &&
      (await this.tableExists('job_order_lines', client))
    ) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from job_order_lines jol
            inner join job_orders jo
              on jo.tenant_id = jol.tenant_id
             and jo.id = jol.job_order_id
            where jol.tenant_id = $1
              and jol.service_id = $2
              and jo.status in ('pending', 'in_progress', 'waiting_for_parts', 'completed')
          ) as value
        `,
        [tenantId, serviceId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('open_job_orders');
      }
    }

    if (
      (await this.tableExists('estimates', client)) &&
      (await this.tableExists('estimate_lines', client))
    ) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from estimate_lines el
            inner join estimates e
              on e.tenant_id = el.tenant_id
             and e.id = el.estimate_id
            where el.tenant_id = $1
              and el.service_id = $2
              and e.status in ('draft', 'presented')
          ) as value
        `,
        [tenantId, serviceId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('active_estimates');
      }
    }

    return [...blockers];
  }

  private async tableExists(
    tableName: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<RegclassRow>(
      `
        select to_regclass($1) as value
      `,
      [`public.${tableName}`],
    );

    return result.rows[0]?.value !== null && result.rows[0]?.value !== undefined;
  }
}

function toServiceRecord(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    normalizedName: row.normalized_name,
    startingPrice: normalizeMoneyString(row.starting_price),
    variablePrice: row.variable_price,
    priceDisclaimer: row.price_disclaimer,
    description: row.description,
    status: row.status,
    deactivatedAt: toNullableDate(row.deactivated_at),
    reactivatedAt: toNullableDate(row.reactivated_at),
    createdAt: toDate(row.created_at),
    createdByUserId: row.created_by_user_id,
    updatedAt: toDate(row.updated_at),
    updatedByUserId: row.updated_by_user_id,
    lockVersion: row.lock_version,
  };
}

function normalizeMoneyString(value: string | number): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '0.00';
  }

  return numericValue.toFixed(2);
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
