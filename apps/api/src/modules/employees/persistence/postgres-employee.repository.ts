import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type ActiveRoleRecord,
  type ChangeEmployeeStatusInput,
  type CreateEmployeeInput,
  type CreateInvitationInput,
  type ExpirePendingInvitationsInput,
  EmployeeStore,
  type EmployeeInvitationRecord,
  type EmployeeInvitationStatus,
  type EmployeeRecord,
  type EmployeeStatus,
  type ReplaceEmployeeBranchesInput,
  type ReplaceEmployeeRolesInput,
  type RevokeInvitationInput,
  type UpdateEmployeeInput,
} from '../application/employee.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface CountRow extends DatabaseRow {
  readonly count: number | string;
}

interface ActiveRoleRow extends DatabaseRow {
  readonly id: string;
  readonly role_type: string;
}

interface ActiveBranchRow extends DatabaseRow {
  readonly id: string;
}

interface EmployeeRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly normalized_email: string;
  readonly mobile_number: string | null;
  readonly status: EmployeeStatus;
  readonly user_status: EmployeeStatus;
  readonly tenant_wide_branch_access: boolean;
  readonly role_ids: readonly string[] | string | null;
  readonly branch_ids: readonly string[] | string | null;
  readonly lock_version: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly deactivated_at: Date | string | null;
  readonly reactivated_at: Date | string | null;
}

interface InvitationRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly normalized_email: string;
  readonly status: EmployeeInvitationStatus;
  readonly expires_at: Date | string;
  readonly accepted_at: Date | string | null;
  readonly revoked_at: Date | string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresEmployeeRepository extends EmployeeStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(
    input: {
      readonly tenantId: string;
      readonly userId: string;
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<BooleanRow>(
      `
        select exists (
          select 1
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
           and r.role_type = 'shop_owner'
          inner join users u
            on u.tenant_id = ur.tenant_id
           and u.id = ur.user_id
           and u.status = 'active'
          inner join employee_profiles ep
            on ep.tenant_id = ur.tenant_id
           and ep.user_id = ur.user_id
           and ep.status = 'active'
          where ur.tenant_id = $1
            and ur.user_id = $2
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async listEmployees(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly EmployeeRecord[]> {
    const result = await client.query<EmployeeRow>(
      `
        select
          ep.id,
          ep.tenant_id,
          ep.user_id,
          ep.full_name,
          u.email,
          u.normalized_email,
          ep.mobile_number,
          ep.status,
          u.status as user_status,
          ep.tenant_wide_branch_access,
          coalesce(
            array(
              select ur.role_id::text
              from user_roles ur
              inner join roles r
                on r.tenant_id = ur.tenant_id
               and r.id = ur.role_id
               and r.status = 'active'
              where ur.tenant_id = ep.tenant_id
                and ur.user_id = ep.user_id
                and ur.removed_at is null
              order by ur.role_id::text
            ),
            array[]::text[]
          ) as role_ids,
          coalesce(
            array(
              select uba.branch_id::text
              from user_branch_assignments uba
              inner join branches b
                on b.tenant_id = uba.tenant_id
               and b.id = uba.branch_id
               and b.status = 'active'
              where uba.tenant_id = ep.tenant_id
                and uba.user_id = ep.user_id
                and uba.removed_at is null
              order by uba.branch_id::text
            ),
            array[]::text[]
          ) as branch_ids,
          u.lock_version,
          ep.created_at,
          greatest(ep.updated_at, u.updated_at) as updated_at,
          ep.deactivated_at,
          ep.reactivated_at
        from employee_profiles ep
        inner join users u
          on u.tenant_id = ep.tenant_id
         and u.id = ep.user_id
         and u.user_type = 'tenant_user'
        where ep.tenant_id = $1
        order by ep.status asc, ep.full_name asc, ep.id asc
      `,
      [tenantId],
    );

    return result.rows.map(toEmployeeRecord);
  }

  async findEmployeeById(
    tenantId: string,
    employeeId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<EmployeeRecord | null> {
    const result = await client.query<EmployeeRow>(
      `
        select
          ep.id,
          ep.tenant_id,
          ep.user_id,
          ep.full_name,
          u.email,
          u.normalized_email,
          ep.mobile_number,
          ep.status,
          u.status as user_status,
          ep.tenant_wide_branch_access,
          coalesce(
            array(
              select ur.role_id::text
              from user_roles ur
              inner join roles r
                on r.tenant_id = ur.tenant_id
               and r.id = ur.role_id
               and r.status = 'active'
              where ur.tenant_id = ep.tenant_id
                and ur.user_id = ep.user_id
                and ur.removed_at is null
              order by ur.role_id::text
            ),
            array[]::text[]
          ) as role_ids,
          coalesce(
            array(
              select uba.branch_id::text
              from user_branch_assignments uba
              inner join branches b
                on b.tenant_id = uba.tenant_id
               and b.id = uba.branch_id
               and b.status = 'active'
              where uba.tenant_id = ep.tenant_id
                and uba.user_id = ep.user_id
                and uba.removed_at is null
              order by uba.branch_id::text
            ),
            array[]::text[]
          ) as branch_ids,
          u.lock_version,
          ep.created_at,
          greatest(ep.updated_at, u.updated_at) as updated_at,
          ep.deactivated_at,
          ep.reactivated_at
        from employee_profiles ep
        inner join users u
          on u.tenant_id = ep.tenant_id
         and u.id = ep.user_id
         and u.user_type = 'tenant_user'
        where ep.tenant_id = $1
          and ep.id = $2
        limit 1
      `,
      [tenantId, employeeId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toEmployeeRecord(row);
  }

  async createEmployee(
    input: CreateEmployeeInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord> {
    const result = await client.query<EmployeeRow>(
      `
        with created_user as (
          insert into users (
            id,
            tenant_id,
            user_type,
            email,
            normalized_email,
            password_hash,
            status,
            full_name,
            mobile_number,
            created_at,
            updated_at
          )
          values ($1, $2, 'tenant_user', $3, $4, $5, 'inactive', $6, $7, $8, $8)
          returning *
        ),
        created_employee as (
          insert into employee_profiles (
            id,
            tenant_id,
            user_id,
            full_name,
            mobile_number,
            status,
            created_at,
            updated_at
          )
          select $9, tenant_id, id, full_name, mobile_number, 'inactive', $8, $8
          from created_user
          returning *
        )
        select
          ep.id,
          ep.tenant_id,
          ep.user_id,
          ep.full_name,
          u.email,
          u.normalized_email,
          ep.mobile_number,
          ep.status,
          u.status as user_status,
          ep.tenant_wide_branch_access,
          array[]::text[] as role_ids,
          array[]::text[] as branch_ids,
          u.lock_version,
          ep.created_at,
          greatest(ep.updated_at, u.updated_at) as updated_at,
          ep.deactivated_at,
          ep.reactivated_at
        from created_employee ep
        inner join created_user u on u.id = ep.user_id
      `,
      [
        input.userId,
        input.tenantId,
        input.email,
        input.normalizedEmail,
        input.passwordHash,
        input.fullName,
        input.mobileNumber,
        input.createdAt,
        input.employeeId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Employee create did not return a row.');
    }

    return toEmployeeRecord(row);
  }

  async updateEmployee(
    input: UpdateEmployeeInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null> {
    const result = await client.query<{ readonly id: string }>(
      `
        with target_employee as (
          select ep.user_id
          from employee_profiles ep
          inner join users u
            on u.tenant_id = ep.tenant_id
           and u.id = ep.user_id
          where ep.tenant_id = $1
            and ep.id = $2
            and u.lock_version = $6
          limit 1
        ),
        updated_user as (
          update users u
          set
            full_name = $3,
            mobile_number = $4,
            updated_at = $5,
            lock_version = lock_version + 1
          from target_employee te
          where u.id = te.user_id
          returning u.id
        ),
        updated_employee as (
          update employee_profiles ep
          set
            full_name = $3,
            mobile_number = $4,
            updated_at = $5
          from updated_user u
          where ep.tenant_id = $1
            and ep.id = $2
            and ep.user_id = u.id
          returning ep.id
        )
        select id from updated_employee
      `,
      [
        input.tenantId,
        input.employeeId,
        input.fullName,
        input.mobileNumber,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return this.findEmployeeById(input.tenantId, input.employeeId, client);
  }

  async changeEmployeeStatus(
    input: ChangeEmployeeStatusInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null> {
    const statusTimestampSet =
      input.toStatus === 'active'
        ? 'reactivated_at = $6, deactivated_at = null'
        : 'deactivated_at = $6';

    const result = await client.query<{ readonly id: string }>(
      `
        with target_employee as (
          select ep.user_id
          from employee_profiles ep
          inner join users u
            on u.tenant_id = ep.tenant_id
           and u.id = ep.user_id
          where ep.tenant_id = $1
            and ep.id = $2
            and ep.status = $3
            and u.status = $3
            and u.lock_version = $5
          limit 1
        ),
        updated_user as (
          update users u
          set
            status = $4,
            updated_at = $6,
            lock_version = lock_version + 1
          from target_employee te
          where u.id = te.user_id
          returning u.id
        ),
        updated_employee as (
          update employee_profiles ep
          set
            status = $4,
            ${statusTimestampSet},
            updated_at = $6
          from updated_user u
          where ep.tenant_id = $1
            and ep.id = $2
            and ep.user_id = u.id
          returning ep.id
        )
        select id from updated_employee
      `,
      [
        input.tenantId,
        input.employeeId,
        input.fromStatus,
        input.toStatus,
        input.expectedLockVersion,
        input.changedAt,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return this.findEmployeeById(input.tenantId, input.employeeId, client);
  }

  async findActiveRolesByIds(
    tenantId: string,
    roleIds: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ActiveRoleRecord[]> {
    if (roleIds.length === 0) {
      return [];
    }

    const result = await client.query<ActiveRoleRow>(
      `
        select id, role_type
        from roles
        where tenant_id = $1
          and id = any($2::uuid[])
          and status = 'active'
        order by id
      `,
      [tenantId, roleIds],
    );

    return result.rows.map((row) => ({
      id: row.id,
      roleType: row.role_type,
    }));
  }

  async findActiveBranchesByIds(
    tenantId: string,
    branchIds: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly string[]> {
    if (branchIds.length === 0) {
      return [];
    }

    const result = await client.query<ActiveBranchRow>(
      `
        select id
        from branches
        where tenant_id = $1
          and id = any($2::uuid[])
          and status = 'active'
        order by id
      `,
      [tenantId, branchIds],
    );

    return result.rows.map((row) => row.id);
  }

  async replaceEmployeeRoles(
    input: ReplaceEmployeeRolesInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null> {
    const lockResult = await client.query<{ readonly id: string }>(
      `
        update users
        set
          updated_at = $4,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and lock_version = $3
        returning id
      `,
      [input.tenantId, input.userId, input.expectedLockVersion, input.changedAt],
    );

    if (lockResult.rows[0] === undefined) {
      return null;
    }

    await client.query(
      `
        update user_roles
        set removed_at = $3
        where tenant_id = $1
          and user_id = $2
          and removed_at is null
          and not (role_id = any($4::uuid[]))
      `,
      [input.tenantId, input.userId, input.changedAt, input.roleIds],
    );

    await client.query(
      `
        insert into user_roles (
          id,
          tenant_id,
          user_id,
          role_id,
          assigned_at
        )
        select gen_random_uuid(), $1, $2, role_id, $4
        from unnest($3::uuid[]) as requested(role_id)
        where not exists (
          select 1
          from user_roles existing
          where existing.tenant_id = $1
            and existing.user_id = $2
            and existing.role_id = requested.role_id
            and existing.removed_at is null
        )
      `,
      [input.tenantId, input.userId, input.roleIds, input.changedAt],
    );

    const employeeId = await this.findEmployeeIdByUserId(input.tenantId, input.userId, client);

    return employeeId === null ? null : this.findEmployeeById(input.tenantId, employeeId, client);
  }

  async replaceEmployeeBranches(
    input: ReplaceEmployeeBranchesInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null> {
    const lockResult = await client.query<{ readonly id: string }>(
      `
        update users
        set
          updated_at = $4,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and lock_version = $3
        returning id
      `,
      [input.tenantId, input.userId, input.expectedLockVersion, input.changedAt],
    );

    if (lockResult.rows[0] === undefined) {
      return null;
    }

    await client.query(
      `
        update employee_profiles
        set
          tenant_wide_branch_access = $3,
          updated_at = $4
        where tenant_id = $1
          and id = $2
      `,
      [input.tenantId, input.employeeId, input.tenantWideBranchAccess, input.changedAt],
    );

    await client.query(
      `
        update user_branch_assignments
        set removed_at = $3
        where tenant_id = $1
          and user_id = $2
          and removed_at is null
          and not (branch_id = any($4::uuid[]))
      `,
      [input.tenantId, input.userId, input.changedAt, input.branchIds],
    );

    if (input.branchIds.length > 0) {
      await client.query(
        `
          insert into user_branch_assignments (
            id,
            tenant_id,
            user_id,
            branch_id,
            assigned_at,
            assigned_by_user_id
          )
          select gen_random_uuid(), $1, $2, branch_id, $5, $4
          from unnest($3::uuid[]) as requested(branch_id)
          where not exists (
            select 1
            from user_branch_assignments existing
            where existing.tenant_id = $1
              and existing.user_id = $2
              and existing.branch_id = requested.branch_id
              and existing.removed_at is null
          )
        `,
        [input.tenantId, input.userId, input.branchIds, input.assignedByUserId, input.changedAt],
      );
    }

    return this.findEmployeeById(input.tenantId, input.employeeId, client);
  }

  async revokeRefreshSessionsForUser(
    input: { readonly userId: string; readonly revokedAt: Date },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        update refresh_sessions
        set revoked_at = coalesce(revoked_at, $2)
        where user_id = $1
          and revoked_at is null
      `,
      [input.userId, input.revokedAt],
    );
  }

  async createPasswordResetToken(
    input: {
      readonly id: string;
      readonly userId: string;
      readonly tokenHash: string;
      readonly expiresAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at
        )
        values ($1, $2, $3, $4)
      `,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async countActiveShopOwners(
    input: { readonly tenantId: string; readonly excludingUserId?: string },
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        select count(*)
        from users u
        inner join employee_profiles ep
          on ep.tenant_id = u.tenant_id
         and ep.user_id = u.id
         and ep.status = 'active'
        inner join user_roles ur
          on ur.tenant_id = u.tenant_id
         and ur.user_id = u.id
         and ur.removed_at is null
        inner join roles r
          on r.tenant_id = ur.tenant_id
         and r.id = ur.role_id
         and r.status = 'active'
         and r.role_type = 'shop_owner'
        where u.tenant_id = $1
          and u.status = 'active'
          and ($2::uuid is null or u.id <> $2::uuid)
      `,
      [input.tenantId, input.excludingUserId ?? null],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async countActiveRolesForUser(
    input: { readonly tenantId: string; readonly userId: string },
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        select count(*)
        from user_roles ur
        inner join roles r
          on r.tenant_id = ur.tenant_id
         and r.id = ur.role_id
         and r.status = 'active'
        where ur.tenant_id = $1
          and ur.user_id = $2
          and ur.removed_at is null
      `,
      [input.tenantId, input.userId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async countActiveBranchAssignmentsForUser(
    input: { readonly tenantId: string; readonly userId: string },
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        select count(*)
        from user_branch_assignments uba
        inner join branches b
          on b.tenant_id = uba.tenant_id
         and b.id = uba.branch_id
         and b.status = 'active'
        where uba.tenant_id = $1
          and uba.user_id = $2
          and uba.removed_at is null
      `,
      [input.tenantId, input.userId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async activeUserExistsByNormalizedEmail(
    normalizedEmail: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<BooleanRow>(
      `
        select exists (
          select 1
          from users
          where normalized_email = $1
            and status = 'active'
        ) as value
      `,
      [normalizedEmail],
    );

    return result.rows[0]?.value ?? false;
  }

  async pendingInvitationExists(
    input: { readonly tenantId: string; readonly normalizedEmail: string },
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<BooleanRow>(
      `
        select exists (
          select 1
          from employee_invitations
          where tenant_id = $1
            and normalized_email = $2
            and status = 'pending'
            and expires_at > now()
            and accepted_at is null
            and revoked_at is null
        ) as value
      `,
      [input.tenantId, input.normalizedEmail],
    );

    return result.rows[0]?.value ?? false;
  }

  async listInvitations(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly EmployeeInvitationRecord[]> {
    const result = await client.query<InvitationRow>(
      `
        select
          id,
          tenant_id,
          email,
          normalized_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_by_user_id,
          created_at
        from employee_invitations
        where tenant_id = $1
        order by created_at desc, id desc
      `,
      [tenantId],
    );

    return result.rows.map(toInvitationRecord);
  }

  async findInvitationById(
    tenantId: string,
    invitationId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<EmployeeInvitationRecord | null> {
    const result = await client.query<InvitationRow>(
      `
        select
          id,
          tenant_id,
          email,
          normalized_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_by_user_id,
          created_at
        from employee_invitations
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, invitationId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toInvitationRecord(row);
  }

  async expirePendingInvitations(
    input: ExpirePendingInvitationsInput,
    client: DatabaseQueryClient,
  ): Promise<readonly EmployeeInvitationRecord[]> {
    const result = await client.query<InvitationRow>(
      `
        update employee_invitations
        set status = 'expired'
        where tenant_id = $1
          and status = 'pending'
          and expires_at <= $2
          and accepted_at is null
          and revoked_at is null
        returning
          id,
          tenant_id,
          email,
          normalized_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_by_user_id,
          created_at
      `,
      [input.tenantId, input.expiredAt],
    );

    return result.rows.map(toInvitationRecord);
  }

  async createInvitation(
    input: CreateInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord> {
    const result = await client.query<InvitationRow>(
      `
        insert into employee_invitations (
          id,
          tenant_id,
          email,
          normalized_email,
          token_hash,
          status,
          expires_at,
          created_by_user_id
        )
        values ($1, $2, $3, $4, $5, 'pending', $6, $7)
        returning
          id,
          tenant_id,
          email,
          normalized_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_by_user_id,
          created_at
      `,
      [
        input.id,
        input.tenantId,
        input.email,
        input.normalizedEmail,
        input.tokenHash,
        input.expiresAt,
        input.createdByUserId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Employee invitation create did not return a row.');
    }

    return toInvitationRecord(row);
  }

  async revokeInvitation(
    input: RevokeInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord | null> {
    const result = await client.query<InvitationRow>(
      `
        update employee_invitations
        set
          status = 'revoked',
          revoked_at = $3
        where tenant_id = $1
          and id = $2
          and status = 'pending'
          and expires_at > $3
          and accepted_at is null
          and revoked_at is null
        returning
          id,
          tenant_id,
          email,
          normalized_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_by_user_id,
          created_at
      `,
      [input.tenantId, input.invitationId, input.revokedAt],
    );

    const row = result.rows[0];

    return row === undefined ? null : toInvitationRecord(row);
  }

  private async findEmployeeIdByUserId(
    tenantId: string,
    userId: string,
    client: DatabaseQueryClient,
  ): Promise<string | null> {
    const result = await client.query<{ readonly id: string }>(
      `
        select id
        from employee_profiles
        where tenant_id = $1
          and user_id = $2
        limit 1
      `,
      [tenantId, userId],
    );

    return result.rows[0]?.id ?? null;
  }
}

function toEmployeeRecord(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    normalizedEmail: row.normalized_email,
    mobileNumber: row.mobile_number,
    status: row.status,
    userStatus: row.user_status,
    tenantWideBranchAccess: row.tenant_wide_branch_access,
    roleIds: normalizeUuidArray(row.role_ids),
    branchIds: normalizeUuidArray(row.branch_ids),
    lockVersion: Number(row.lock_version),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deactivatedAt: toNullableDate(row.deactivated_at),
    reactivatedAt: toNullableDate(row.reactivated_at),
  };
}

function toInvitationRecord(row: InvitationRow): EmployeeInvitationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    normalizedEmail: row.normalized_email,
    status: row.status,
    expiresAt: toDate(row.expires_at),
    acceptedAt: toNullableDate(row.accepted_at),
    revokedAt: toNullableDate(row.revoked_at),
    createdByUserId: row.created_by_user_id,
    createdAt: toDate(row.created_at),
  };
}

function normalizeUuidArray(value: readonly string[] | string | null): readonly string[] {
  if (value === null) {
    return [];
  }

  if (typeof value !== 'string') {
    return value.map((entry) => String(entry)).sort();
  }

  const trimmedValue = value.trim();

  if (trimmedValue === '{}' || trimmedValue.length === 0) {
    return [];
  }

  return trimmedValue
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(',')
    .map((entry) => entry.replace(/^"|"$/g, '').trim())
    .filter((entry) => entry.length > 0)
    .sort();
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}
