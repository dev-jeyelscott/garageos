import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import type {
  CreateBranchRequest,
  CreateCustomerRequest,
  CreateMotorcycleRequest,
  CreateRoleRequest,
  CreateServiceRequest,
  ListQuery,
  UpdateBranchRequest,
  UpdateCustomerRequest,
  UpdateEmployeeRequest,
  UpdateMotorcycleRequest,
  UpdateRoleRequest,
  UpdateServiceRequest,
} from '../api/master-data.schemas';
import {
  MasterDataStore,
  type CreateRecordInput,
  type MasterDataRecord,
  type TenantResourceInput,
} from '../application/master-data.store';

interface CountRow extends DatabaseRow {
  readonly count: string | number;
}

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface NumberRow extends DatabaseRow {
  readonly value: string | number | null;
}

@Injectable()
export class PostgresMasterDataRepository extends MasterDataStore {
  constructor(@Inject(API_DATABASE_CLIENT) private readonly database: DatabaseQueryClient) {
    super();
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<BooleanRow>(
      `
        select exists (
          select 1 from user_roles ur
          join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
          where ur.tenant_id = $1 and ur.user_id = $2 and ur.removed_at is null
            and r.status = 'active' and r.role_type = 'shop_owner'
        ) as value
      `,
      [input.tenantId, input.userId],
    );
    return result.rows[0]?.value ?? false;
  }

  async countActiveBranches(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    return this.count(
      client,
      `select count(*) from branches where tenant_id = $1 and status = 'active'`,
      [tenantId],
    );
  }

  async getEffectiveMaxActiveBranches(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<NumberRow>(
      `
        with subscription_limit as (
          select spl.numeric_value
          from tenant_subscriptions ts
          join subscription_plan_limits spl on spl.plan_id = ts.plan_id and spl.capability_code = 'max_active_branches'
          where ts.tenant_id = $1
          limit 1
        ),
        active_override as (
          select coalesce(nullif(override_value_json ->> 'numeric_value', '')::numeric, nullif(override_value_json ->> 'value', '')::numeric) as numeric_value
          from tenant_plan_overrides
          where tenant_id = $1 and capability_code = 'max_active_branches' and (expires_at is null or expires_at > now())
          order by effective_at desc, created_at desc
          limit 1
        )
        select coalesce((select numeric_value from active_override), (select numeric_value from subscription_limit), 0) as value
      `,
      [tenantId],
    );
    return Number(result.rows[0]?.value ?? 0);
  }

  async listBranches(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select id, name, address, contact_number, business_hours_json as business_hours, status, deactivated_at, reactivated_at, created_at, updated_at, lock_version
       from branches where tenant_id = $1`,
      tenantId,
      query,
      ['name', 'address', 'contact_number'],
    );
  }

  async getBranch(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `select id, name, address, contact_number, business_hours_json as business_hours, status, deactivated_at, reactivated_at, created_at, updated_at, lock_version from branches where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id],
    );
  }

  async createBranch(
    input: CreateRecordInput<CreateBranchRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord> {
    const r = input.request;
    return this.requiredOne(
      client,
      `insert into branches (id, tenant_id, name, normalized_name, address, contact_number, business_hours_json, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'active',$8,$8)
       returning id, name, address, contact_number, business_hours_json as business_hours, status, created_at, updated_at, lock_version`,
      [
        input.id,
        input.tenantId,
        r.name.trim(),
        normalizeName(r.name),
        r.address.trim(),
        r.contact_number.trim(),
        JSON.stringify(r.business_hours),
        input.now,
      ],
    );
  }

  async updateBranch(
    input: TenantResourceInput & { readonly request: UpdateBranchRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const current = await this.getBranch(input, client);
    if (!current) return null;
    const r = input.request;
    return this.one(
      client,
      `update branches set
         name = coalesce($3, name),
         normalized_name = coalesce($4, normalized_name),
         address = coalesce($5, address),
         contact_number = coalesce($6, contact_number),
         business_hours_json = coalesce($7::jsonb, business_hours_json),
         updated_at = $8,
         lock_version = lock_version + 1
       where tenant_id = $1 and id = $2
       returning id, name, address, contact_number, business_hours_json as business_hours, status, created_at, updated_at, lock_version`,
      [
        input.tenantId,
        input.id,
        textOrNull(r.name),
        r.name ? normalizeName(r.name) : null,
        textOrNull(r.address),
        textOrNull(r.contact_number),
        r.business_hours ? JSON.stringify(r.business_hours) : null,
        input.now,
      ],
    );
  }

  async setBranchStatus(
    input: TenantResourceInput & {
      readonly status: 'active' | 'inactive';
      readonly actorUserId: string;
      readonly reason: string | null;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const before = await this.getBranch(input, client);
    if (!before) return null;
    const result = await this.one(
      client,
      `update branches set status = $3, deactivated_at = case when $3 = 'inactive' then $4 else deactivated_at end, reactivated_at = case when $3 = 'active' then $4 else reactivated_at end, updated_at = $4, lock_version = lock_version + 1
       where tenant_id = $1 and id = $2
       returning id, name, address, contact_number, business_hours_json as business_hours, status, deactivated_at, reactivated_at, created_at, updated_at, lock_version`,
      [input.tenantId, input.id, input.status, input.now],
    );
    await client.query(
      `insert into branch_status_events (tenant_id, branch_id, from_status, to_status, reason, created_by_user_id, created_at) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.id,
        before.status,
        input.status,
        input.reason,
        input.actorUserId,
        input.now,
      ],
    );
    return result;
  }

  async hasBranchDeactivationBlockers(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<boolean> {
    const checks = [
      `select 1 from job_orders where tenant_id = $1 and branch_id = $2 and status not in ('released','cancelled') limit 1`,
      `select 1 from purchase_orders where tenant_id = $1 and branch_id = $2 and status not in ('closed','cancelled') limit 1`,
      `select 1 from inventory_transfers where tenant_id = $1 and (source_branch_id = $2 or destination_branch_id = $2) and status in ('draft','pending','in_transit') limit 1`,
      `select 1 from inventory_reservations where tenant_id = $1 and branch_id = $2 and status = 'active' limit 1`,
      `select 1 from stock_balances where tenant_id = $1 and branch_id = $2 and on_hand_qty <> 0 limit 1`,
    ];
    for (const sql of checks) {
      const result = await client.query(sql, [input.tenantId, input.id]);
      if ((result.rowCount ?? 0) > 0) return true;
    }
    return false;
  }

  async listPermissions(): Promise<readonly MasterDataRecord[]> {
    const result = await this.database.query(
      `select id, code, category, description from permissions order by category asc, code asc`,
    );
    return result.rows;
  }

  async listRoles(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select id, name, role_type, is_seeded_template, status, created_at, updated_at from roles where tenant_id = $1`,
      tenantId,
      query,
      ['name', 'role_type'],
    );
  }

  async getRole(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    const role = await this.one(
      client,
      `select id, name, role_type, is_seeded_template, status, created_at, updated_at from roles where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id],
    );
    if (!role) return null;
    const permissions = await client.query(
      `select p.code from role_permissions rp join permissions p on p.id = rp.permission_id where rp.tenant_id = $1 and rp.role_id = $2 order by p.code`,
      [input.tenantId, input.id],
    );
    return { ...role, permission_codes: permissions.rows.map((row) => row.code) };
  }

  async createRole(
    input: CreateRecordInput<CreateRoleRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord> {
    const role = await this.requiredOne(
      client,
      `insert into roles (id, tenant_id, name, normalized_name, role_type, is_seeded_template, status, created_at, updated_at)
       values ($1,$2,$3,$4,'custom',false,'active',$5,$5)
       returning id, name, role_type, is_seeded_template, status, created_at, updated_at`,
      [
        input.id,
        input.tenantId,
        input.request.name.trim(),
        normalizeName(input.request.name),
        input.now,
      ],
    );
    await this.replaceRolePermissions(
      input.tenantId,
      input.id,
      input.request.permission_codes,
      client,
    );
    return { ...role, permission_codes: input.request.permission_codes };
  }

  async updateRole(
    input: TenantResourceInput & { readonly request: UpdateRoleRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const current = await this.getRole(input, client);
    if (!current) return null;
    if (current.role_type === 'shop_owner') return current;
    const role = await this.one(
      client,
      `update roles set name = coalesce($3, name), normalized_name = coalesce($4, normalized_name), updated_at = $5 where tenant_id = $1 and id = $2 and role_type = 'custom'
       returning id, name, role_type, is_seeded_template, status, created_at, updated_at`,
      [
        input.tenantId,
        input.id,
        textOrNull(input.request.name),
        input.request.name ? normalizeName(input.request.name) : null,
        input.now,
      ],
    );
    if (!role) return null;
    if (input.request.permission_codes)
      await this.replaceRolePermissions(
        input.tenantId,
        input.id,
        input.request.permission_codes,
        client,
      );
    return this.getRole(input, client);
  }

  async deactivateRole(
    input: TenantResourceInput & { readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `update roles set status = 'inactive', updated_at = $3 where tenant_id = $1 and id = $2 and role_type = 'custom' returning id, name, role_type, is_seeded_template, status, created_at, updated_at`,
      [input.tenantId, input.id, input.now],
    );
  }

  async activeUsersDependingOnlyOnRole(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<number> {
    return this.count(
      client,
      `select count(*) from user_roles ur
       where ur.tenant_id = $1 and ur.role_id = $2 and ur.removed_at is null
       and not exists (
         select 1 from user_roles other_ur join roles other_r on other_r.tenant_id = other_ur.tenant_id and other_r.id = other_ur.role_id and other_r.status = 'active'
         where other_ur.tenant_id = ur.tenant_id and other_ur.user_id = ur.user_id and other_ur.removed_at is null and other_ur.role_id <> ur.role_id
       )`,
      [input.tenantId, input.id],
    );
  }

  async listEmployees(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select ep.id, ep.user_id, ep.full_name, u.email, ep.mobile_number, ep.status, ep.tenant_wide_branch_access, ep.created_at, ep.updated_at from employee_profiles ep join users u on u.id = ep.user_id and u.tenant_id = ep.tenant_id where ep.tenant_id = $1`,
      tenantId,
      query,
      ['ep.full_name', 'u.email', 'ep.mobile_number'],
    );
  }

  async getEmployee(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    const employee = await this.one(
      client,
      `select ep.id, ep.user_id, ep.full_name, u.email, ep.mobile_number, ep.status, ep.tenant_wide_branch_access, ep.created_at, ep.updated_at from employee_profiles ep join users u on u.id = ep.user_id and u.tenant_id = ep.tenant_id where ep.tenant_id = $1 and ep.id = $2`,
      [input.tenantId, input.id],
    );
    if (!employee) return null;
    const roles = await client.query(
      `select r.id, r.name, r.role_type from user_roles ur join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id where ur.tenant_id = $1 and ur.user_id = $2 and ur.removed_at is null order by r.name`,
      [input.tenantId, employee.user_id],
    );
    const branches = await client.query(
      `select b.id, b.name from user_branch_assignments uba join branches b on b.tenant_id = uba.tenant_id and b.id = uba.branch_id where uba.tenant_id = $1 and uba.user_id = $2 and uba.removed_at is null order by b.name`,
      [input.tenantId, employee.user_id],
    );
    return { ...employee, roles: roles.rows, branches: branches.rows };
  }

  async updateEmployee(
    input: TenantResourceInput & {
      readonly request: UpdateEmployeeRequest;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const employee = await this.getEmployee(input, client);
    if (!employee) return null;
    await client.query(
      `update employee_profiles set full_name = coalesce($3, full_name), mobile_number = coalesce($4, mobile_number), tenant_wide_branch_access = coalesce($5, tenant_wide_branch_access), updated_at = $6 where tenant_id = $1 and id = $2`,
      [
        input.tenantId,
        input.id,
        textOrNull(input.request.full_name),
        nullableText(input.request.mobile_number),
        input.request.tenant_wide_branch_access ?? null,
        input.now,
      ],
    );
    await client.query(
      `update users set full_name = coalesce($3, full_name), mobile_number = coalesce($4, mobile_number), updated_at = $5 where tenant_id = $1 and id = $2`,
      [
        input.tenantId,
        employee.user_id,
        textOrNull(input.request.full_name),
        nullableText(input.request.mobile_number),
        input.now,
      ],
    );
    if (input.request.role_ids)
      await this.replaceUserRoles(
        input.tenantId,
        String(employee.user_id),
        input.request.role_ids,
        input.actorUserId,
        input.now,
        client,
      );
    if (input.request.branch_ids || input.request.tenant_wide_branch_access === true)
      await this.replaceUserBranches(
        input.tenantId,
        String(employee.user_id),
        input.request.branch_ids ?? [],
        input.actorUserId,
        input.now,
        client,
      );
    return this.getEmployee(input, client);
  }

  async setEmployeeStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'inactive'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const employee = await this.getEmployee(input, client);
    if (!employee) return null;
    await client.query(
      `update employee_profiles set status = $3, deactivated_at = case when $3 = 'inactive' then $4 else deactivated_at end, reactivated_at = case when $3 = 'active' then $4 else reactivated_at end, updated_at = $4 where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id, input.status, input.now],
    );
    await client.query(
      `update users set status = $3, updated_at = $4 where tenant_id = $1 and id = $2`,
      [input.tenantId, employee.user_id, input.status, input.now],
    );
    return this.getEmployee(input, client);
  }

  async countActiveShopOwners(tenantId: string, client: DatabaseQueryClient): Promise<number> {
    return this.count(
      client,
      `select count(distinct ur.user_id) from user_roles ur join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id where ur.tenant_id = $1 and ur.removed_at is null and r.role_type = 'shop_owner' and r.status = 'active'`,
      [tenantId],
    );
  }

  async isShopOwnerEmployee(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<boolean> {
    const employee = await this.getEmployee(input, client);
    if (!employee) return false;
    const result = await client.query<BooleanRow>(
      `select exists (select 1 from user_roles ur join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id where ur.tenant_id = $1 and ur.user_id = $2 and ur.removed_at is null and r.role_type = 'shop_owner' and r.status = 'active') as value`,
      [input.tenantId, employee.user_id],
    );
    return result.rows[0]?.value ?? false;
  }

  async revokeEmployeeSessions(
    input: TenantResourceInput & { readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<void> {
    const employee = await this.getEmployee(input, client);
    if (!employee) return;
    await client.query(
      `update refresh_sessions set revoked_at = $3 where tenant_id = $1 and user_id = $2 and revoked_at is null`,
      [input.tenantId, employee.user_id, input.now],
    );
  }

  async listCustomers(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select id, name, mobile_number, email, address, birthday, notes, status, created_at, updated_at, lock_version from customers where tenant_id = $1`,
      tenantId,
      { ...query, status: query.status ?? 'active' },
      ['name', 'mobile_number', 'email'],
    );
  }

  async getCustomer(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `select id, name, mobile_number, email, address, birthday, notes, status, merged_into_customer_id, deleted_at, created_at, updated_at, lock_version from customers where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id],
    );
  }

  async createCustomer(
    input: CreateRecordInput<CreateCustomerRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord> {
    const r = input.request;
    return this.requiredOne(
      client,
      `insert into customers (id, tenant_id, name, normalized_name, mobile_number, normalized_mobile, email, normalized_email, address, birthday, notes, status, created_at, created_by_user_id, updated_at, updated_by_user_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$12,$13) returning id, name, mobile_number, email, address, birthday, notes, status, created_at, updated_at, lock_version`,
      [
        input.id,
        input.tenantId,
        r.name.trim(),
        normalizeName(r.name),
        nullableText(r.mobile_number),
        normalizeNullable(r.mobile_number),
        nullableText(r.email),
        normalizeNullable(r.email),
        nullableText(r.address),
        r.birthday ?? null,
        nullableText(r.notes),
        input.now,
        input.actorUserId,
      ],
    );
  }

  async updateCustomer(
    input: TenantResourceInput & {
      readonly request: UpdateCustomerRequest;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const r = input.request;
    return this.one(
      client,
      `update customers set name = coalesce($3, name), normalized_name = coalesce($4, normalized_name), mobile_number = coalesce($5, mobile_number), normalized_mobile = coalesce($6, normalized_mobile), email = coalesce($7, email), normalized_email = coalesce($8, normalized_email), address = coalesce($9, address), birthday = coalesce($10::date, birthday), notes = coalesce($11, notes), updated_at = $12, updated_by_user_id = $13, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, name, mobile_number, email, address, birthday, notes, status, created_at, updated_at, lock_version`,
      [
        input.tenantId,
        input.id,
        textOrNull(r.name),
        r.name ? normalizeName(r.name) : null,
        nullableText(r.mobile_number),
        normalizeNullable(r.mobile_number),
        nullableText(r.email),
        normalizeNullable(r.email),
        nullableText(r.address),
        r.birthday ?? null,
        nullableText(r.notes),
        input.now,
        input.actorUserId,
      ],
    );
  }

  async setCustomerStatus(
    input: TenantResourceInput & {
      readonly status: 'active' | 'soft_deleted';
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `update customers set status = $3, deleted_at = case when $3 = 'soft_deleted' then $4 else null end, updated_at = $4, updated_by_user_id = $5, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, name, mobile_number, email, address, birthday, notes, status, deleted_at, created_at, updated_at, lock_version`,
      [input.tenantId, input.id, input.status, input.now, input.actorUserId],
    );
  }

  async mergeCustomers(
    input: {
      readonly tenantId: string;
      readonly sourceCustomerId: string;
      readonly survivingCustomerId: string;
      readonly actorUserId: string;
      readonly reason: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const source = await this.getCustomer(
      { tenantId: input.tenantId, id: input.sourceCustomerId },
      client,
    );
    const survivor = await this.getCustomer(
      { tenantId: input.tenantId, id: input.survivingCustomerId },
      client,
    );
    if (!source || !survivor) return null;
    await client.query(
      `update customers set status = 'merged', merged_into_customer_id = $3, updated_at = $4, updated_by_user_id = $5, lock_version = lock_version + 1 where tenant_id = $1 and id = $2`,
      [
        input.tenantId,
        input.sourceCustomerId,
        input.survivingCustomerId,
        input.now,
        input.actorUserId,
      ],
    );
    await client.query(
      `update motorcycles set customer_id = $3, updated_at = $4, lock_version = lock_version + 1 where tenant_id = $1 and customer_id = $2`,
      [input.tenantId, input.sourceCustomerId, input.survivingCustomerId, input.now],
    );
    await client.query(
      `insert into customer_merge_events (tenant_id, source_customer_id, surviving_customer_id, reason, created_by_user_id, created_at) values ($1,$2,$3,$4,$5,$6)`,
      [
        input.tenantId,
        input.sourceCustomerId,
        input.survivingCustomerId,
        input.reason,
        input.actorUserId,
        input.now,
      ],
    );
    return this.getCustomer({ tenantId: input.tenantId, id: input.sourceCustomerId }, client);
  }

  async listCustomerMotorcycles(input: TenantResourceInput): Promise<readonly MasterDataRecord[]> {
    const result = await this.database.query(
      `select id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, created_at, updated_at, lock_version from motorcycles where tenant_id = $1 and customer_id = $2 order by updated_at desc, id desc`,
      [input.tenantId, input.id],
    );
    return result.rows;
  }

  async listMotorcycles(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, created_at, updated_at, lock_version from motorcycles where tenant_id = $1`,
      tenantId,
      { ...query, status: query.status ?? 'active' },
      ['brand', 'model', 'plate_number', 'engine_number', 'chassis_number'],
    );
  }

  async getMotorcycle(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `select id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, deleted_at, created_at, updated_at, lock_version from motorcycles where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id],
    );
  }

  async createMotorcycle(
    input: CreateRecordInput<CreateMotorcycleRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord> {
    const r = input.request;
    return this.requiredOne(
      client,
      `insert into motorcycles (id, tenant_id, customer_id, brand, model, year, color, plate_number, normalized_plate_number, engine_number, normalized_engine_number, chassis_number, normalized_chassis_number, latest_mileage, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$15) returning id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, created_at, updated_at, lock_version`,
      [
        input.id,
        input.tenantId,
        r.customer_id,
        r.brand.trim(),
        r.model.trim(),
        r.year ?? null,
        nullableText(r.color),
        nullableText(r.plate_number),
        normalizeIdentifier(r.plate_number),
        nullableText(r.engine_number),
        normalizeIdentifier(r.engine_number),
        nullableText(r.chassis_number),
        normalizeIdentifier(r.chassis_number),
        r.latest_mileage,
        input.now,
      ],
    );
  }

  async updateMotorcycle(
    input: TenantResourceInput & { readonly request: UpdateMotorcycleRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const r = input.request;
    return this.one(
      client,
      `update motorcycles set customer_id = coalesce($3, customer_id), brand = coalesce($4, brand), model = coalesce($5, model), year = coalesce($6, year), color = coalesce($7, color), plate_number = coalesce($8, plate_number), normalized_plate_number = coalesce($9, normalized_plate_number), engine_number = coalesce($10, engine_number), normalized_engine_number = coalesce($11, normalized_engine_number), chassis_number = coalesce($12, chassis_number), normalized_chassis_number = coalesce($13, normalized_chassis_number), latest_mileage = coalesce($14, latest_mileage), updated_at = $15, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, created_at, updated_at, lock_version`,
      [
        input.tenantId,
        input.id,
        r.customer_id ?? null,
        textOrNull(r.brand),
        textOrNull(r.model),
        r.year ?? null,
        nullableText(r.color),
        nullableText(r.plate_number),
        normalizeIdentifier(r.plate_number),
        nullableText(r.engine_number),
        normalizeIdentifier(r.engine_number),
        nullableText(r.chassis_number),
        normalizeIdentifier(r.chassis_number),
        r.latest_mileage ?? null,
        input.now,
      ],
    );
  }

  async setMotorcycleStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'soft_deleted'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `update motorcycles set status = $3, deleted_at = case when $3 = 'soft_deleted' then $4 else null end, updated_at = $4, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, deleted_at, created_at, updated_at, lock_version`,
      [input.tenantId, input.id, input.status, input.now],
    );
  }

  async correctMotorcycleMileage(
    input: TenantResourceInput & {
      readonly newMileage: number;
      readonly reason: string;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const current = await this.getMotorcycle(input, client);
    if (!current) return null;
    await client.query(
      `insert into motorcycle_mileage_events (tenant_id, motorcycle_id, source_type, previous_mileage, new_mileage, reason, created_by_user_id, created_at) values ($1,$2,'manual_correction',$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.id,
        current.latest_mileage,
        input.newMileage,
        input.reason,
        input.actorUserId,
        input.now,
      ],
    );
    return this.one(
      client,
      `update motorcycles set latest_mileage = $3, updated_at = $4, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, customer_id, brand, model, year, color, plate_number, engine_number, chassis_number, latest_mileage, status, created_at, updated_at, lock_version`,
      [input.tenantId, input.id, input.newMileage, input.now],
    );
  }

  async listServices(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]> {
    return this.list(
      `select id, name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at, lock_version from services where tenant_id = $1`,
      tenantId,
      { ...query, status: query.status ?? 'active' },
      ['name', 'description'],
    );
  }

  async getService(
    input: TenantResourceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `select id, name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at, lock_version from services where tenant_id = $1 and id = $2`,
      [input.tenantId, input.id],
    );
  }

  async createService(
    input: CreateRecordInput<CreateServiceRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord> {
    const r = input.request;
    return this.requiredOne(
      client,
      `insert into services (id, tenant_id, name, normalized_name, starting_price, variable_price, price_disclaimer, description, status, created_at, created_by_user_id, updated_at, updated_by_user_id) values ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$9,$10) returning id, name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at, lock_version`,
      [
        input.id,
        input.tenantId,
        r.name.trim(),
        normalizeName(r.name),
        r.starting_price,
        r.variable_price ?? false,
        nullableText(r.price_disclaimer),
        nullableText(r.description),
        input.now,
        input.actorUserId,
      ],
    );
  }

  async updateService(
    input: TenantResourceInput & { readonly request: UpdateServiceRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    const r = input.request;
    return this.one(
      client,
      `update services set name = coalesce($3, name), normalized_name = coalesce($4, normalized_name), starting_price = coalesce($5, starting_price), variable_price = coalesce($6, variable_price), price_disclaimer = coalesce($7, price_disclaimer), description = coalesce($8, description), updated_at = $9, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at, lock_version`,
      [
        input.tenantId,
        input.id,
        textOrNull(r.name),
        r.name ? normalizeName(r.name) : null,
        r.starting_price ?? null,
        r.variable_price ?? null,
        nullableText(r.price_disclaimer),
        nullableText(r.description),
        input.now,
      ],
    );
  }

  async setServiceStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'inactive'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null> {
    return this.one(
      client,
      `update services set status = $3, updated_at = $4, lock_version = lock_version + 1 where tenant_id = $1 and id = $2 returning id, name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at, lock_version`,
      [input.tenantId, input.id, input.status, input.now],
    );
  }

  private async replaceRolePermissions(
    tenantId: string,
    roleId: string,
    permissionCodes: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(`delete from role_permissions where tenant_id = $1 and role_id = $2`, [
      tenantId,
      roleId,
    ]);
    await client.query(
      `insert into role_permissions (tenant_id, role_id, permission_id)
       select $1, $2, p.id from permissions p where p.code = any($3::text[])`,
      [tenantId, roleId, [...new Set(permissionCodes)]],
    );
  }

  private async replaceUserRoles(
    tenantId: string,
    userId: string,
    roleIds: readonly string[],
    actorUserId: string,
    now: Date,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `update user_roles set removed_at = $4 where tenant_id = $1 and user_id = $2 and removed_at is null and role_id <> all($3::uuid[])`,
      [tenantId, userId, roleIds, now],
    );
    for (const roleId of roleIds) {
      await client.query(
        `insert into user_roles (tenant_id, user_id, role_id, assigned_at, assigned_by_user_id) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [tenantId, userId, roleId, now, actorUserId],
      );
    }
  }

  private async replaceUserBranches(
    tenantId: string,
    userId: string,
    branchIds: readonly string[],
    actorUserId: string,
    now: Date,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `update user_branch_assignments set removed_at = $4 where tenant_id = $1 and user_id = $2 and removed_at is null and branch_id <> all($3::uuid[])`,
      [tenantId, userId, branchIds, now],
    );
    for (const branchId of branchIds) {
      await client.query(
        `insert into user_branch_assignments (tenant_id, user_id, branch_id, assigned_at, assigned_by_user_id) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [tenantId, userId, branchId, now, actorUserId],
      );
    }
  }

  private async list(
    baseSql: string,
    tenantId: string,
    query: ListQuery,
    searchColumns: readonly string[],
  ): Promise<readonly MasterDataRecord[]> {
    const values: unknown[] = [tenantId];
    const where: string[] = [];
    if (query.status) {
      values.push(query.status);
      where.push(`status = $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q.trim().toLowerCase()}%`);
      where.push(
        `(${searchColumns.map((column) => `lower(${column}) like $${values.length}`).join(' or ')})`,
      );
    }
    if (query.cursor) {
      values.push(query.cursor);
      where.push(`id > $${values.length}`);
    }
    values.push(query.limit ?? 50);
    const sql = `${baseSql} ${where.length ? `and ${where.join(' and ')}` : ''} order by id asc limit $${values.length}`;
    const result = await this.database.query(sql, values);
    return result.rows;
  }

  private async count(
    client: DatabaseQueryClient,
    sql: string,
    values: readonly unknown[],
  ): Promise<number> {
    const result = await client.query<CountRow>(sql, values);
    return Number(result.rows[0]?.count ?? 0);
  }

  private async one(
    client: DatabaseQueryClient,
    sql: string,
    values: readonly unknown[],
  ): Promise<MasterDataRecord | null> {
    const result = await client.query(sql, values);
    return result.rows[0] ?? null;
  }

  private async requiredOne(
    client: DatabaseQueryClient,
    sql: string,
    values: readonly unknown[],
  ): Promise<MasterDataRecord> {
    const row = await this.one(client, sql, values);
    if (!row) throw new Error('Expected database write to return a row.');
    return row;
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeNullable(value: string | null | undefined): string | null {
  return nullableText(value)?.toLowerCase() ?? null;
}

function normalizeIdentifier(value: string | null | undefined): string | null {
  return nullableText(value)?.replace(/\s+/g, '').toUpperCase() ?? null;
}

function textOrNull(value: string | null | undefined): string | null {
  return value === undefined || value === null ? null : value.trim();
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = textOrNull(value);
  return normalized && normalized.length > 0 ? normalized : null;
}
