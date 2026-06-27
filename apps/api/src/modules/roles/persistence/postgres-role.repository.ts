import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateRoleInput,
  type DeactivateRoleInput,
  type PermissionRecord,
  type ReplaceRolePermissionsInput,
  ROLE_TYPES,
  type RoleRecord,
  RoleStore,
  type RoleStatus,
  type RoleType,
  type SoleRoleDependencyInput,
  type UpdateRoleInput,
} from '../application/role.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface CountRow extends DatabaseRow {
  readonly count: number | string;
}

interface PermissionRow extends DatabaseRow {
  readonly id: string;
  readonly code: string;
  readonly category: string;
  readonly description: string | null;
}

interface RoleRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly role_type: string;
  readonly is_seeded_template: boolean;
  readonly status: RoleStatus;
  readonly lock_version: number;
  readonly permission_codes: readonly string[] | string | null;
  readonly assigned_user_count: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

@Injectable()
export class PostgresRoleRepository extends RoleStore {
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

  async listRoles(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly RoleRecord[]> {
    const result = await client.query<RoleRow>(
      `
        select
          r.id,
          r.tenant_id,
          r.name,
          r.normalized_name,
          r.role_type,
          r.is_seeded_template,
          r.status,
          r.lock_version,
          coalesce(
            array_agg(distinct p.code order by p.code) filter (where p.code is not null),
            '{}'::text[]
          ) as permission_codes,
          count(distinct ur.user_id) filter (
            where ur.user_id is not null
              and u.status = 'active'
              and ep.status = 'active'
          ) as assigned_user_count,
          r.created_at,
          r.updated_at
        from roles r
        left join role_permissions rp
          on rp.tenant_id = r.tenant_id
         and rp.role_id = r.id
        left join permissions p
          on p.id = rp.permission_id
        left join user_roles ur
          on ur.tenant_id = r.tenant_id
         and ur.role_id = r.id
         and ur.removed_at is null
        left join users u
          on u.tenant_id = ur.tenant_id
         and u.id = ur.user_id
        left join employee_profiles ep
          on ep.tenant_id = ur.tenant_id
         and ep.user_id = ur.user_id
        where r.tenant_id = $1
        group by
          r.id,
          r.tenant_id,
          r.name,
          r.normalized_name,
          r.role_type,
          r.is_seeded_template,
          r.status,
          r.lock_version,
          r.created_at,
          r.updated_at
        order by
          case when r.status = 'active' then 0 else 1 end,
          r.normalized_name asc,
          r.id asc
      `,
      [tenantId],
    );

    return result.rows.map(toRoleRecord);
  }

  async findRoleById(
    tenantId: string,
    roleId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<RoleRecord | null> {
    const result = await client.query<RoleRow>(
      `
        select
          r.id,
          r.tenant_id,
          r.name,
          r.normalized_name,
          r.role_type,
          r.is_seeded_template,
          r.status,
          r.lock_version,
          coalesce(
            array_agg(distinct p.code order by p.code) filter (where p.code is not null),
            '{}'::text[]
          ) as permission_codes,
          count(distinct ur.user_id) filter (
            where ur.user_id is not null
              and u.status = 'active'
              and ep.status = 'active'
          ) as assigned_user_count,
          r.created_at,
          r.updated_at
        from roles r
        left join role_permissions rp
          on rp.tenant_id = r.tenant_id
         and rp.role_id = r.id
        left join permissions p
          on p.id = rp.permission_id
        left join user_roles ur
          on ur.tenant_id = r.tenant_id
         and ur.role_id = r.id
         and ur.removed_at is null
        left join users u
          on u.tenant_id = ur.tenant_id
         and u.id = ur.user_id
        left join employee_profiles ep
          on ep.tenant_id = ur.tenant_id
         and ep.user_id = ur.user_id
        where r.tenant_id = $1
          and r.id = $2
        group by
          r.id,
          r.tenant_id,
          r.name,
          r.normalized_name,
          r.role_type,
          r.is_seeded_template,
          r.status,
          r.lock_version,
          r.created_at,
          r.updated_at
        limit 1
      `,
      [tenantId, roleId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toRoleRecord(row);
  }

  async listTenantAssignablePermissions(
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly PermissionRecord[]> {
    const result = await client.query<PermissionRow>(
      `
        select id, code, category, description
        from permissions
        where code not like 'platform.%'
        order by category asc, code asc
      `,
    );

    return result.rows.map(toPermissionRecord);
  }

  async findTenantAssignablePermissionsByCodes(
    permissionCodes: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly PermissionRecord[]> {
    if (permissionCodes.length === 0) {
      return [];
    }

    const result = await client.query<PermissionRow>(
      `
        select id, code, category, description
        from permissions
        where code = any($1::text[])
          and code not like 'platform.%'
        order by code asc
      `,
      [permissionCodes],
    );

    return result.rows.map(toPermissionRecord);
  }

  async createRole(input: CreateRoleInput, client: DatabaseQueryClient): Promise<RoleRecord> {
    await client.query(
      `
        insert into roles (
          id,
          tenant_id,
          name,
          normalized_name,
          role_type,
          is_seeded_template,
          status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, 'active', $7, $7)
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.roleType,
        input.isSeededTemplate,
        input.createdAt,
      ],
    );

    const role = await this.findRoleById(input.tenantId, input.id, client);

    if (role === null) {
      throw new Error('Role create did not return a readable row.');
    }

    return role;
  }

  async replaceRolePermissions(
    input: ReplaceRolePermissionsInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        delete from role_permissions
        where tenant_id = $1
          and role_id = $2
      `,
      [input.tenantId, input.roleId],
    );

    if (input.permissionIds.length === 0) {
      return;
    }

    await client.query(
      `
        insert into role_permissions (
          tenant_id,
          role_id,
          permission_id,
          created_at
        )
        select $1, $2, unnest($3::uuid[]), $4
        on conflict (role_id, permission_id) do nothing
      `,
      [input.tenantId, input.roleId, input.permissionIds, input.createdAt],
    );
  }

  async updateRole(
    input: UpdateRoleInput,
    client: DatabaseQueryClient,
  ): Promise<RoleRecord | null> {
    const result = await client.query<{ readonly id: string }>(
      `
        update roles
        set
          name = $3,
          normalized_name = $4,
          updated_at = $5,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $6
        returning id
      `,
      [
        input.tenantId,
        input.roleId,
        input.name,
        input.normalizedName,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return this.findRoleById(input.tenantId, input.roleId, client);
  }

  async deactivateRole(
    input: DeactivateRoleInput,
    client: DatabaseQueryClient,
  ): Promise<RoleRecord | null> {
    const result = await client.query<{ readonly id: string }>(
      `
        update roles
        set
          status = 'inactive',
          updated_at = $3,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $4
        returning id
      `,
      [input.tenantId, input.roleId, input.updatedAt, input.expectedLockVersion],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return this.findRoleById(input.tenantId, input.roleId, client);
  }

  async countActiveUsersDependingSolelyOnRole(
    input: SoleRoleDependencyInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        with active_assignments as (
          select ur.user_id, ur.role_id
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
          inner join users u
            on u.tenant_id = ur.tenant_id
           and u.id = ur.user_id
           and u.status = 'active'
          inner join employee_profiles ep
            on ep.tenant_id = ur.tenant_id
           and ep.user_id = ur.user_id
           and ep.status = 'active'
          where ur.tenant_id = $1
            and ur.removed_at is null
        ),
        active_role_counts as (
          select user_id, count(*) as role_count
          from active_assignments
          group by user_id
        )
        select count(*) as count
        from active_assignments aa
        inner join active_role_counts arc
          on arc.user_id = aa.user_id
        where aa.role_id = $2
          and arc.role_count = 1
      `,
      [input.tenantId, input.roleId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async countActiveAssignedUsers(
    input: SoleRoleDependencyInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        select count(distinct ur.user_id) as count
        from user_roles ur
        inner join users u
          on u.tenant_id = ur.tenant_id
         and u.id = ur.user_id
         and u.status = 'active'
        inner join employee_profiles ep
          on ep.tenant_id = ur.tenant_id
         and ep.user_id = ur.user_id
         and ep.status = 'active'
        where ur.tenant_id = $1
          and ur.role_id = $2
          and ur.removed_at is null
      `,
      [input.tenantId, input.roleId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }
}

function toPermissionRecord(row: PermissionRow): PermissionRecord {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    description: row.description,
  };
}

function toRoleRecord(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    normalizedName: row.normalized_name,
    roleType: toRoleType(row.role_type),
    isSeededTemplate: row.is_seeded_template,
    status: row.status,
    lockVersion: Number(row.lock_version),
    permissionCodes: normalizePermissionCodes(row.permission_codes),
    assignedUserCount: Number(row.assigned_user_count),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toRoleType(value: string): RoleType {
  switch (value) {
    case ROLE_TYPES.SHOP_OWNER:
    case ROLE_TYPES.MANAGER:
    case ROLE_TYPES.SERVICE_ADVISOR:
    case ROLE_TYPES.MECHANIC:
    case ROLE_TYPES.CASHIER:
    case ROLE_TYPES.INVENTORY_CLERK:
    case ROLE_TYPES.CUSTOM:
      return value;
    default:
      throw new Error(`Unsupported role type: ${value}`);
  }
}

function normalizePermissionCodes(value: readonly string[] | string | null): readonly string[] {
  if (value === null) {
    return [];
  }

  if (typeof value !== 'string') {
    return value.map((permissionCode: string): string => String(permissionCode)).sort();
  }

  const trimmedValue = value.trim();

  if (trimmedValue === '{}' || trimmedValue.length === 0) {
    return [];
  }

  const rawPermissionCodes = trimmedValue.replace(/^\{/, '').replace(/\}$/, '').split(',');

  return rawPermissionCodes
    .map((permissionCode: string): string => permissionCode.replace(/^"|"$/g, '').trim())
    .filter((permissionCode: string): boolean => permissionCode.length > 0)
    .sort();
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
