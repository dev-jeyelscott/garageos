import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateOwnerSignupEmailVerificationTokenInput,
  type CreateOwnerSignupEmployeeProfileInput,
  type CreateOwnerSignupLifecycleEventInput,
  type CreateOwnerSignupRoleInput,
  type CreateOwnerSignupSubscriptionInput,
  type CreateOwnerSignupTenantInput,
  type CreateOwnerSignupUserInput,
  type CreateOwnerSignupUserRoleInput,
  OwnerSignupStore,
  type OwnerSignupDefaultPlanRecord,
  type OwnerSignupTenantRecord,
} from '../application/owner-signup.store';

interface DefaultPlanRow extends DatabaseRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly default_duration_days: number | string | null;
}

interface TenantRow extends DatabaseRow {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email: string;
  readonly status: 'pending_setup';
}

@Injectable()
export class PostgresOwnerSignupRepository extends OwnerSignupStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async findDefaultActivePlan(
    client: DatabaseQueryClient = this.database,
  ): Promise<OwnerSignupDefaultPlanRecord | null> {
    const result = await client.query<DefaultPlanRow>(
      `
        select id, code, name, default_duration_days
        from subscription_plans
        where status = 'active'
          and is_default = true
        limit 1
      `,
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      code: toPlanCode(row.code),
      name: row.name,
      defaultDurationDays:
        row.default_duration_days === null ? null : Number(row.default_duration_days),
    };
  }

  async findNonDeletedTenantByBusinessEmail(
    input: {
      readonly normalizedBusinessName: string;
      readonly normalizedShopEmail: string;
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<OwnerSignupTenantRecord | null> {
    const result = await client.query<TenantRow>(
      `
        select id, business_name, shop_email, status
        from tenants
        where normalized_business_name = $1
          and normalized_shop_email = $2
          and status <> 'deleted'
        limit 1
      `,
      [input.normalizedBusinessName, input.normalizedShopEmail],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapTenant(row);
  }

  async createTenant(
    input: CreateOwnerSignupTenantInput,
    client: DatabaseQueryClient,
  ): Promise<OwnerSignupTenantRecord> {
    const result = await client.query<TenantRow>(
      `
        insert into tenants (
          id,
          business_name,
          normalized_business_name,
          shop_email,
          normalized_shop_email,
          status,
          timezone,
          country,
          currency,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, 'pending_setup', $6, $7, $8, $9, $9)
        returning id, business_name, shop_email, status
      `,
      [
        input.id,
        input.businessName,
        input.normalizedBusinessName,
        input.shopEmail,
        input.normalizedShopEmail,
        input.timezone,
        input.country,
        input.currency,
        input.createdAt,
      ],
    );

    return mapTenant(getRequiredRow(result.rows, 'create owner signup tenant'));
  }

  async createTenantSubscription(
    input: CreateOwnerSignupSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into tenant_subscriptions (
          tenant_id,
          plan_id,
          start_date,
          expiration_date,
          status_source,
          updated_at
        )
        values ($1, $2, $3::date, $4::date, 'system_computed', $5)
      `,
      [input.tenantId, input.planId, input.startDate, input.expirationDate, input.updatedAt],
    );
  }

  async createOwnerUser(
    input: CreateOwnerSignupUserInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into users (
          id,
          tenant_id,
          user_type,
          email,
          normalized_email,
          password_hash,
          status,
          full_name,
          created_at,
          updated_at
        )
        values ($1, $2, 'tenant_user', $3, $4, $5, 'active', $6, $7, $7)
      `,
      [
        input.id,
        input.tenantId,
        input.email,
        input.normalizedEmail,
        input.passwordHash,
        input.fullName,
        input.createdAt,
      ],
    );
  }

  async createOwnerRoleWithAllTenantPermissions(
    input: CreateOwnerSignupRoleInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
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
        values (
          $1,
          $2,
          'Shop Owner',
          'shop owner',
          'shop_owner',
          true,
          'active',
          $3,
          $3
        )
      `,
      [input.id, input.tenantId, input.createdAt],
    );

    await client.query(
      `
        insert into role_permissions (
          tenant_id,
          role_id,
          permission_id,
          created_at
        )
        select $1, $2, p.id, $3
        from permissions p
        where p.code not like 'platform.%'
        on conflict do nothing
      `,
      [input.tenantId, input.id, input.createdAt],
    );
  }

  async createOwnerEmployeeProfile(
    input: CreateOwnerSignupEmployeeProfileInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into employee_profiles (
          id,
          tenant_id,
          user_id,
          full_name,
          status,
          tenant_wide_branch_access,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, 'active', true, $5, $5)
      `,
      [input.id, input.tenantId, input.userId, input.fullName, input.createdAt],
    );
  }

  async assignOwnerRole(
    input: CreateOwnerSignupUserRoleInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into user_roles (
          id,
          tenant_id,
          user_id,
          role_id,
          assigned_at
        )
        values ($1, $2, $3, $4, $5)
      `,
      [input.id, input.tenantId, input.userId, input.roleId, input.assignedAt],
    );
  }

  async createEmailVerificationToken(
    input: CreateOwnerSignupEmailVerificationTokenInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into email_verification_tokens (
          id,
          user_id,
          token_hash,
          email,
          expires_at,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [input.id, input.userId, input.tokenHash, input.email, input.expiresAt, input.createdAt],
    );
  }

  async createTenantLifecycleEvent(
    input: CreateOwnerSignupLifecycleEventInput,
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
        values ($1, $2, null, $3, 'tenant_user', 'owner_signup_tenant_created', $4, $5)
      `,
      [input.id, input.tenantId, input.toStatus, input.effectiveAt, input.createdAt],
    );
  }

  async seedTenantOnboardingDefaults(tenantId: string, client: DatabaseQueryClient): Promise<void> {
    await client.query(
      `
        insert into product_categories (
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at
        )
        select gen_random_uuid(), $1, category_name, lower(category_name), 'active', now()
        from unnest(array[
          'Engine Oil',
          'Tires',
          'Accessories',
          'Brake Parts',
          'CVT Parts',
          'Lubricants'
        ]) as seed(category_name)
        on conflict do nothing
      `,
      [tenantId],
    );
  }
}

function mapTenant(row: TenantRow): OwnerSignupTenantRecord {
  return {
    id: row.id,
    businessName: row.business_name,
    shopEmail: row.shop_email,
    status: 'pending_setup',
  };
}

function toPlanCode(value: string): 'basic' | 'mid' | 'high' {
  switch (value) {
    case 'basic':
    case 'mid':
    case 'high':
      return value;
    default:
      throw new Error(`Unsupported owner signup default plan code: ${value}`);
  }
}

function getRequiredRow<Row>(rows: readonly Row[], operation: string): Row {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(`Owner signup repository failed to ${operation}.`);
  }

  return row;
}
