import { Inject, Injectable } from '@nestjs/common';

import type { AuthBranchSummary, AuthTenantSummary } from '../contracts';
import {
  AuthLoginContext,
  AuthUserStore,
  toAuthTenantStatus,
  toAuthUserStatus,
  toAuthUserType,
  UpdateAuthUserPasswordHashInput,
} from '../application/auth-user.store';
import { AUTH_DATABASE_CLIENT, type DatabaseQueryClient } from './database-client';

interface UserLoginRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly user_type: string;
  readonly email: string;
  readonly password_hash: string;
  readonly email_verified_at: Date | string | null;
  readonly status: string;
  readonly full_name: string;
  readonly tenant_business_name: string | null;
  readonly tenant_status: string | null;
  readonly tenant_timezone: string | null;
  readonly tenant_country: string | null;
  readonly tenant_currency: string | null;
}

interface PermissionRow {
  readonly code: string;
}

interface EmployeeProfileRow {
  readonly tenant_wide_branch_access: boolean;
}

interface BranchRow {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class PostgresAuthUserRepository extends AuthUserStore {
  constructor(
    @Inject(AUTH_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async findActiveLoginContextByNormalizedEmail(input: {
    readonly normalizedEmail: string;
  }): Promise<AuthLoginContext | null> {
    const user = await this.findActiveUserByNormalizedEmail(input.normalizedEmail);

    return this.buildLoginContext(user);
  }

  async findActiveLoginContextByUserId(input: {
    readonly userId: string;
  }): Promise<AuthLoginContext | null> {
    const user = await this.findActiveUserById(input.userId);

    return this.buildLoginContext(user);
  }

  private async findActiveUserByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<UserLoginRow | null> {
    const result = await this.database.query<UserLoginRow>(
      `
        select
          u.id,
          u.tenant_id,
          u.user_type,
          u.email,
          u.password_hash,
          u.email_verified_at,
          u.status,
          u.full_name,
          t.business_name as tenant_business_name,
          t.status as tenant_status,
          t.timezone as tenant_timezone,
          t.country as tenant_country,
          t.currency as tenant_currency
        from users u
        left join tenants t on t.id = u.tenant_id
        where u.normalized_email = $1
          and u.status = 'active'
        limit 1
      `,
      [normalizedEmail],
    );

    return result.rows[0] ?? null;
  }

  private async buildLoginContext(user: UserLoginRow | null): Promise<AuthLoginContext | null> {
    if (user === null) {
      return null;
    }

    if (user.tenant_id === null) {
      return {
        user: {
          id: user.id,
          tenantId: null,
          userType: toAuthUserType(user.user_type),
          email: user.email,
          passwordHash: user.password_hash,
          emailVerifiedAt: toNullableDate(user.email_verified_at),
          status: toAuthUserStatus(user.status),
          fullName: user.full_name,
        },
        tenant: null,
        permissions: [],
        branches: [],
        tenantWideBranchAccess: false,
      };
    }

    const tenant = mapTenantSummary(user);
    const [permissions, tenantWideBranchAccess] = await Promise.all([
      this.findEffectivePermissions(user.tenant_id, user.id),
      this.findTenantWideBranchAccess(user.tenant_id, user.id),
    ]);

    const branches = await this.findAccessibleBranches({
      tenantId: user.tenant_id,
      userId: user.id,
      tenantWideBranchAccess,
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        userType: toAuthUserType(user.user_type),
        email: user.email,
        passwordHash: user.password_hash,
        emailVerifiedAt: toNullableDate(user.email_verified_at),
        status: toAuthUserStatus(user.status),
        fullName: user.full_name,
      },
      tenant,
      permissions,
      branches,
      tenantWideBranchAccess,
    };
  }

  private async findActiveUserById(userId: string): Promise<UserLoginRow | null> {
    const result = await this.database.query<UserLoginRow>(
      `
      select
        u.id,
        u.tenant_id,
        u.user_type,
        u.email,
        u.password_hash,
        u.email_verified_at,
        u.status,
        u.full_name,
        t.business_name as tenant_business_name,
        t.status as tenant_status,
        t.timezone as tenant_timezone,
        t.country as tenant_country,
        t.currency as tenant_currency
      from users u
      left join tenants t on t.id = u.tenant_id
      where u.id = $1
        and u.status = 'active'
      limit 1
    `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  private async findEffectivePermissions(
    tenantId: string,
    userId: string,
  ): Promise<readonly string[]> {
    const result = await this.database.query<PermissionRow>(
      `
        select distinct p.code
        from user_roles ur
        inner join roles r
          on r.id = ur.role_id
         and r.tenant_id = ur.tenant_id
         and r.status = 'active'
        inner join role_permissions rp
          on rp.role_id = r.id
         and rp.tenant_id = ur.tenant_id
        inner join permissions p
          on p.id = rp.permission_id
        where ur.tenant_id = $1
          and ur.user_id = $2
          and ur.removed_at is null
        order by p.code asc
      `,
      [tenantId, userId],
    );

    return result.rows.map((row) => row.code);
  }

  private async findTenantWideBranchAccess(tenantId: string, userId: string): Promise<boolean> {
    const result = await this.database.query<EmployeeProfileRow>(
      `
        select tenant_wide_branch_access
        from employee_profiles
        where tenant_id = $1
          and user_id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, userId],
    );

    return result.rows[0]?.tenant_wide_branch_access ?? false;
  }

  private async findAccessibleBranches(input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly tenantWideBranchAccess: boolean;
  }): Promise<readonly AuthBranchSummary[]> {
    if (input.tenantWideBranchAccess) {
      const result = await this.database.query<BranchRow>(
        `
          select id, name
          from branches
          where tenant_id = $1
            and status = 'active'
          order by name asc
        `,
        [input.tenantId],
      );

      return result.rows.map(mapBranchSummary);
    }

    const result = await this.database.query<BranchRow>(
      `
        select b.id, b.name
        from user_branch_assignments uba
        inner join branches b
          on b.tenant_id = uba.tenant_id
         and b.id = uba.branch_id
         and b.status = 'active'
        where uba.tenant_id = $1
          and uba.user_id = $2
          and uba.removed_at is null
        order by b.name asc
      `,
      [input.tenantId, input.userId],
    );

    return result.rows.map(mapBranchSummary);
  }

  async updatePasswordHash(input: UpdateAuthUserPasswordHashInput): Promise<void> {
    await this.database.query(
      `
      update users
      set
        password_hash = $2,
        password_changed_at = $3,
        updated_at = $3,
        lock_version = lock_version + 1
      where id = $1
    `,
      [input.userId, input.passwordHash, input.passwordChangedAt],
    );
  }
}

function mapTenantSummary(row: UserLoginRow): AuthTenantSummary {
  if (
    row.tenant_id === null ||
    row.tenant_business_name === null ||
    row.tenant_status === null ||
    row.tenant_timezone === null ||
    row.tenant_country === null ||
    row.tenant_currency === null
  ) {
    throw new Error('Tenant user login context is missing tenant data.');
  }

  return {
    id: row.tenant_id,
    business_name: row.tenant_business_name,
    status: toAuthTenantStatus(row.tenant_status),
    timezone: row.tenant_timezone,
    country: row.tenant_country,
    currency: row.tenant_currency,
  };
}

function mapBranchSummary(row: BranchRow): AuthBranchSummary {
  return {
    id: row.id,
    name: row.name,
  };
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}
