import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateOwnerInvitationInput,
  type CreateTenantInput,
  type CreateTenantLifecycleEventInput,
  type CreateTenantSubscriptionInput,
  type ListPlatformTenantsInput,
  type PlatformPlanCode,
  type PlatformPlanSummary,
  type PlatformSubscriptionSummary,
  type PlatformTenantDetailRecord,
  type PlatformTenantListRecord,
  type PlatformTenantOwnerInvitationSummary,
  type PlatformTenantOwnerSummary,
  type PlatformTenantStatus,
  PlatformTenantStore,
  type UpsertTenantSubscriptionInput,
} from '../application/platform-tenant.store';

interface PlatformTenantRow extends DatabaseRow {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email: string;
  readonly status: string;
  readonly duplicate_approved_at?: Date | string | null;
  readonly duplicate_approved_by_platform_admin_user_id?: string | null;
  readonly duplicate_approval_reason?: string | null;
  readonly timezone: string;
  readonly country: string;
  readonly currency: string;
  readonly onboarding_completed_at?: Date | string | null;
  readonly deletion_scheduled_for?: Date | string | null;
  readonly deleted_at?: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly lock_version: number;
  readonly plan_id: string | null;
  readonly plan_code: string | null;
  readonly plan_name: string | null;
  readonly plan_status: string | null;
  readonly subscription_start_date: Date | string | null;
  readonly subscription_expiration_date: Date | string | null;
  readonly subscription_status_source: string | null;
  readonly subscription_last_renewal_at: Date | string | null;
  readonly subscription_updated_by_platform_admin_user_id: string | null;
  readonly subscription_updated_at: Date | string | null;
  readonly owner_user_id: string | null;
  readonly owner_full_name: string | null;
  readonly owner_email: string | null;
  readonly owner_status: string | null;
  readonly owner_invitation_email: string | null;
  readonly owner_invitation_status: string | null;
  readonly owner_invitation_expires_at: Date | string | null;
}

interface PlatformPlanRow extends DatabaseRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

interface PlatformSubscriptionRow extends DatabaseRow {
  readonly plan_id: string;
  readonly start_date: Date | string;
  readonly expiration_date: Date | string;
  readonly status_source: string;
  readonly last_renewal_at: Date | string | null;
  readonly updated_by_platform_admin_user_id: string | null;
  readonly updated_at: Date | string;
}

interface OwnerInvitationRow extends DatabaseRow {
  readonly email: string;
  readonly status: string;
  readonly expires_at: Date | string;
}

@Injectable()
export class PostgresPlatformTenantRepository extends PlatformTenantStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async listTenants(
    input: ListPlatformTenantsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly PlatformTenantListRecord[]> {
    const result = await client.query<PlatformTenantRow>(
      `
        ${tenantSelectSql()}
        where ($1::text is null or t.status = $1)
          and (
            $2::text is null
            or t.normalized_business_name like $2
            or t.normalized_shop_email like $2
          )
          and (
            $3::timestamptz is null
            or (t.created_at, t.id) < ($3::timestamptz, $4::uuid)
          )
        order by t.created_at desc, t.id desc
        limit $5
      `,
      [
        input.status,
        input.search === null ? null : `%${input.search}%`,
        input.cursorCreatedAt,
        input.cursorId,
        input.limit,
      ],
    );

    return result.rows.map(mapTenantListRecord);
  }

  async findTenantById(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<PlatformTenantDetailRecord | null> {
    const result = await client.query<PlatformTenantRow>(
      `
        ${tenantSelectSql()}
        where t.id = $1
        limit 1
      `,
      [tenantId],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapTenantDetailRecord(row);
  }

  async findActivePlanById(
    planId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<PlatformPlanSummary | null> {
    const result = await client.query<PlatformPlanRow>(
      `
        select id, code, name, status
        from subscription_plans
        where id = $1
          and status = 'active'
        limit 1
      `,
      [planId],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapPlanRow(row);
  }

  async findNonDeletedTenantByBusinessEmail(
    input: {
      readonly normalizedBusinessName: string;
      readonly normalizedShopEmail: string;
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<PlatformTenantDetailRecord | null> {
    const result = await client.query<PlatformTenantRow>(
      `
        ${tenantSelectSql()}
        where t.normalized_business_name = $1
          and t.normalized_shop_email = $2
          and t.status <> 'deleted'
        limit 1
      `,
      [input.normalizedBusinessName, input.normalizedShopEmail],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapTenantDetailRecord(row);
  }

  async createTenant(
    input: CreateTenantInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord> {
    const result = await client.query<PlatformTenantRow>(
      `
        insert into tenants (
          id,
          business_name,
          normalized_business_name,
          shop_email,
          normalized_shop_email,
          status,
          duplicate_approved_at,
          duplicate_approved_by_platform_admin_user_id,
          duplicate_approval_reason,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        returning
          id,
          business_name,
          shop_email,
          status,
          duplicate_approved_at,
          duplicate_approved_by_platform_admin_user_id,
          duplicate_approval_reason,
          timezone,
          country,
          currency,
          onboarding_completed_at,
          deletion_scheduled_for,
          deleted_at,
          created_at,
          updated_at,
          lock_version,
          null::uuid as plan_id,
          null::text as plan_code,
          null::text as plan_name,
          null::text as plan_status,
          null::date as subscription_start_date,
          null::date as subscription_expiration_date,
          null::text as subscription_status_source,
          null::timestamptz as subscription_last_renewal_at,
          null::uuid as subscription_updated_by_platform_admin_user_id,
          null::timestamptz as subscription_updated_at,
          null::uuid as owner_user_id,
          null::text as owner_full_name,
          null::text as owner_email,
          null::text as owner_status,
          null::text as owner_invitation_email,
          null::text as owner_invitation_status,
          null::timestamptz as owner_invitation_expires_at
      `,
      [
        input.id,
        input.businessName,
        input.normalizedBusinessName,
        input.shopEmail,
        input.normalizedShopEmail,
        input.status,
        input.duplicateApprovedAt,
        input.duplicateApprovedByPlatformAdminUserId,
        input.duplicateApprovalReason,
        input.createdAt,
      ],
    );

    return mapTenantDetailRecord(getRequiredRow(result, 'create tenant'));
  }

  async createTenantSubscription(
    input: CreateTenantSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSubscriptionSummary> {
    const result = await client.query<PlatformSubscriptionRow>(
      `
        insert into tenant_subscriptions (
          tenant_id,
          plan_id,
          start_date,
          expiration_date,
          status_source,
          updated_by_platform_admin_user_id,
          updated_at
        )
        values ($1, $2, $3::date, $4::date, 'system_computed', $5, $6)
        returning
          plan_id,
          start_date,
          expiration_date,
          status_source,
          last_renewal_at,
          updated_by_platform_admin_user_id,
          updated_at
      `,
      [
        input.tenantId,
        input.planId,
        input.startDate,
        input.expirationDate,
        input.updatedByPlatformAdminUserId,
        input.updatedAt,
      ],
    );

    return mapSubscriptionRow(getRequiredRow(result, 'create tenant subscription'));
  }

  async upsertTenantSubscription(
    input: UpsertTenantSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSubscriptionSummary> {
    const result = await client.query<PlatformSubscriptionRow>(
      `
        insert into tenant_subscriptions (
          tenant_id,
          plan_id,
          start_date,
          expiration_date,
          status_source,
          updated_by_platform_admin_user_id,
          updated_at
        )
        values ($1, $2, $3::date, $4::date, 'system_computed', $5, $6)
        on conflict (tenant_id) do update set
          plan_id = excluded.plan_id,
          start_date = excluded.start_date,
          expiration_date = excluded.expiration_date,
          status_source = excluded.status_source,
          updated_by_platform_admin_user_id = excluded.updated_by_platform_admin_user_id,
          updated_at = excluded.updated_at
        returning
          plan_id,
          start_date,
          expiration_date,
          status_source,
          last_renewal_at,
          updated_by_platform_admin_user_id,
          updated_at
      `,
      [
        input.tenantId,
        input.planId,
        input.startDate,
        input.expirationDate,
        input.updatedByPlatformAdminUserId,
        input.updatedAt,
      ],
    );

    return mapSubscriptionRow(getRequiredRow(result, 'upsert tenant subscription'));
  }

  async createOwnerInvitation(
    input: CreateOwnerInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantOwnerInvitationSummary> {
    const result = await client.query<OwnerInvitationRow>(
      `
        insert into employee_invitations (
          id,
          tenant_id,
          email,
          normalized_email,
          token_hash,
          status,
          expires_at,
          assigned_role_config_json,
          assigned_branch_config_json,
          created_by_user_id,
          created_at
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9::jsonb,
          $10,
          $11
        )
        returning email, status, expires_at
      `,
      [
        input.id,
        input.tenantId,
        input.email,
        input.normalizedEmail,
        input.tokenHash,
        input.status,
        input.expiresAt,
        JSON.stringify(input.assignedRoleConfigJson),
        JSON.stringify(input.assignedBranchConfigJson),
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapOwnerInvitationRow(getRequiredRow(result, 'create owner invitation'));
  }

  async createTenantLifecycleEvent(
    input: CreateTenantLifecycleEventInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into tenant_lifecycle_events (
          id,
          tenant_id,
          from_status,
          to_status,
          source,
          reason,
          effective_at,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.id,
        input.tenantId,
        input.fromStatus,
        input.toStatus,
        input.source,
        input.reason,
        input.effectiveAt,
        input.createdAt,
      ],
    );
  }
}

function tenantSelectSql(): string {
  return `
    select
      t.id,
      t.business_name,
      t.shop_email,
      t.status,
      t.duplicate_approved_at,
      t.duplicate_approved_by_platform_admin_user_id,
      t.duplicate_approval_reason,
      t.timezone,
      t.country,
      t.currency,
      t.onboarding_completed_at,
      t.deletion_scheduled_for,
      t.deleted_at,
      t.created_at,
      t.updated_at,
      t.lock_version,
      sp.id as plan_id,
      sp.code as plan_code,
      sp.name as plan_name,
      sp.status as plan_status,
      ts.start_date as subscription_start_date,
      ts.expiration_date as subscription_expiration_date,
      ts.status_source as subscription_status_source,
      ts.last_renewal_at as subscription_last_renewal_at,
      ts.updated_by_platform_admin_user_id as subscription_updated_by_platform_admin_user_id,
      ts.updated_at as subscription_updated_at,
      owner_user.id as owner_user_id,
      owner_user.full_name as owner_full_name,
      owner_user.email as owner_email,
      owner_user.status as owner_status,
      owner_invitation.email as owner_invitation_email,
      owner_invitation.status as owner_invitation_status,
      owner_invitation.expires_at as owner_invitation_expires_at
    from tenants t
    left join tenant_subscriptions ts on ts.tenant_id = t.id
    left join subscription_plans sp on sp.id = ts.plan_id
    left join lateral (
      select u.id, u.full_name, u.email, u.status
      from users u
      inner join user_roles ur
        on ur.tenant_id = u.tenant_id
       and ur.user_id = u.id
       and ur.removed_at is null
      inner join roles r
        on r.tenant_id = ur.tenant_id
       and r.id = ur.role_id
       and r.role_type = 'shop_owner'
       and r.status = 'active'
      where u.tenant_id = t.id
        and u.status = 'active'
      order by u.created_at asc, u.id asc
      limit 1
    ) owner_user on true
    left join lateral (
      select ei.email, ei.status, ei.expires_at
      from employee_invitations ei
      where ei.tenant_id = t.id
        and ei.assigned_role_config_json ->> 'role_type' = 'shop_owner'
      order by ei.created_at desc, ei.id desc
      limit 1
    ) owner_invitation on true
  `;
}

function mapTenantListRecord(row: PlatformTenantRow): PlatformTenantListRecord {
  return {
    id: row.id,
    businessName: row.business_name,
    shopEmail: row.shop_email,
    status: toTenantStatus(row.status),
    timezone: row.timezone,
    country: row.country,
    currency: row.currency,
    duplicateApprovedAt: toNullableDate(row.duplicate_approved_at ?? null),
    duplicateApprovedByPlatformAdminUserId:
      row.duplicate_approved_by_platform_admin_user_id ?? null,
    duplicateApprovalReason: row.duplicate_approval_reason ?? null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lockVersion: Number(row.lock_version),
    plan: mapNullablePlan(row),
    subscription: mapNullableSubscription(row),
    owner: mapNullableOwner(row),
    ownerInvitation: mapNullableOwnerInvitation(row),
  };
}

function mapTenantDetailRecord(row: PlatformTenantRow): PlatformTenantDetailRecord {
  return {
    ...mapTenantListRecord(row),
    onboardingCompletedAt: toNullableDate(row.onboarding_completed_at ?? null),
    deletionScheduledFor: toNullableDate(row.deletion_scheduled_for ?? null),
    deletedAt: toNullableDate(row.deleted_at ?? null),
  };
}

function mapNullablePlan(row: PlatformTenantRow): PlatformPlanSummary | null {
  if (
    row.plan_id === null ||
    row.plan_code === null ||
    row.plan_name === null ||
    row.plan_status === null
  ) {
    return null;
  }

  return {
    id: row.plan_id,
    code: toPlanCode(row.plan_code),
    name: row.plan_name,
    status: row.plan_status,
  };
}

function mapNullableSubscription(row: PlatformTenantRow): PlatformSubscriptionSummary | null {
  if (
    row.plan_id === null ||
    row.subscription_start_date === null ||
    row.subscription_expiration_date === null ||
    row.subscription_status_source === null ||
    row.subscription_updated_at === null
  ) {
    return null;
  }

  return {
    planId: row.plan_id,
    startDate: toDateOnly(row.subscription_start_date),
    expirationDate: toDateOnly(row.subscription_expiration_date),
    statusSource: row.subscription_status_source,
    lastRenewalAt: toNullableDate(row.subscription_last_renewal_at),
    updatedByPlatformAdminUserId: row.subscription_updated_by_platform_admin_user_id,
    updatedAt: toDate(row.subscription_updated_at),
  };
}

function mapNullableOwner(row: PlatformTenantRow): PlatformTenantOwnerSummary | null {
  if (
    row.owner_user_id === null ||
    row.owner_full_name === null ||
    row.owner_email === null ||
    row.owner_status === null
  ) {
    return null;
  }

  return {
    id: row.owner_user_id,
    fullName: row.owner_full_name,
    email: row.owner_email,
    status: row.owner_status,
  };
}

function mapNullableOwnerInvitation(
  row: PlatformTenantRow,
): PlatformTenantOwnerInvitationSummary | null {
  if (
    row.owner_invitation_email === null ||
    row.owner_invitation_status === null ||
    row.owner_invitation_expires_at === null
  ) {
    return null;
  }

  return {
    email: row.owner_invitation_email,
    status: row.owner_invitation_status,
    expiresAt: toDate(row.owner_invitation_expires_at),
  };
}

function mapPlanRow(row: PlatformPlanRow): PlatformPlanSummary {
  return {
    id: row.id,
    code: toPlanCode(row.code),
    name: row.name,
    status: row.status,
  };
}

function mapSubscriptionRow(row: PlatformSubscriptionRow): PlatformSubscriptionSummary {
  return {
    planId: row.plan_id,
    startDate: toDateOnly(row.start_date),
    expirationDate: toDateOnly(row.expiration_date),
    statusSource: row.status_source,
    lastRenewalAt: toNullableDate(row.last_renewal_at),
    updatedByPlatformAdminUserId: row.updated_by_platform_admin_user_id,
    updatedAt: toDate(row.updated_at),
  };
}

function mapOwnerInvitationRow(row: OwnerInvitationRow): PlatformTenantOwnerInvitationSummary {
  return {
    email: row.email,
    status: row.status,
    expiresAt: toDate(row.expires_at),
  };
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Platform tenant repository failed to ${operation}.`);
  }

  return row;
}

function toTenantStatus(value: string): PlatformTenantStatus {
  switch (value) {
    case 'pending_setup':
    case 'active':
    case 'grace_period':
    case 'read_only':
    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
      return value;
    default:
      throw new Error(`Unsupported tenant status: ${value}`);
  }
}

function toPlanCode(value: string): PlatformPlanCode {
  switch (value) {
    case 'basic':
    case 'mid':
    case 'high':
      return value;
    default:
      throw new Error(`Unsupported platform plan code: ${value}`);
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}
