import { Inject, Injectable } from '@nestjs/common';

import type {
  AuthBranchSummary,
  AuthEffectivePlanLimits,
  AuthEffectivePlanSummary,
  AuthPlanCode,
  AuthSubscriptionSummary,
  AuthSubscriptionWarning,
  AuthTenantStatus,
  AuthTenantSummary,
} from '../contracts';

import {
  AuthLoginContext,
  AuthUserStore,
  MarkAuthUserEmailVerifiedInput,
  toAuthTenantStatus,
  toAuthUserStatus,
  toAuthUserType,
  UpdateAuthUserPasswordHashInput,
} from '../application/auth-user.store';
import { AUTH_DATABASE_CLIENT, type DatabaseQueryClient } from './database-client';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  type SubscriptionStatusSource,
} from '../../../shared/tenant-context/tenant-context';

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

interface SubscriptionRow {
  readonly plan_id: string;
  readonly plan_code: string;
  readonly plan_name: string;
  readonly expiration_date: Date | string;
  readonly status_source: string;
}

interface PlanLimitRow {
  readonly capability_code: string;
  readonly value_type: string;
  readonly numeric_value: number | string | null;
  readonly boolean_value: boolean | null;
}

interface SessionSubscriptionContext {
  readonly effectivePlan: AuthEffectivePlanSummary;
  readonly subscription: AuthSubscriptionSummary;
  readonly subscriptionStatusSource: SubscriptionStatusSource;
}

const NEAR_EXPIRATION_WARNING_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
        effectivePlan: null,
        subscription: null,
        subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
      };
    }

    const tenant = mapTenantSummary(user);
    const now = new Date();

    const [permissions, tenantWideBranchAccess, sessionSubscription] = await Promise.all([
      this.findEffectivePermissions(user.tenant_id, user.id),
      this.findTenantWideBranchAccess(user.tenant_id, user.id),
      this.findSessionSubscriptionContext({
        tenantId: user.tenant_id,
        tenantStatus: tenant.status,
        tenantTimezone: tenant.timezone,
        now,
      }),
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
      effectivePlan: sessionSubscription?.effectivePlan ?? null,
      subscription: sessionSubscription?.subscription ?? null,
      subscriptionStatusSource:
        sessionSubscription?.subscriptionStatusSource ??
        SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
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

  async markEmailVerified(input: MarkAuthUserEmailVerifiedInput): Promise<boolean> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const result = await this.database.query<{ readonly id: string }>(
      `
        update users
        set
          email_verified_at = coalesce(email_verified_at, $3),
          updated_at = case
            when email_verified_at is null then $3
            else updated_at
          end,
          lock_version = case
            when email_verified_at is null then lock_version + 1
            else lock_version
          end
        where id = $1
          and normalized_email = $2
          and status = 'active'
        returning id
      `,
      [input.userId, normalizedEmail, input.emailVerifiedAt],
    );

    return result.rows[0] !== undefined;
  }

  private async findSessionSubscriptionContext(input: {
    readonly tenantId: string;
    readonly tenantStatus: AuthTenantStatus;
    readonly tenantTimezone: string;
    readonly now: Date;
  }): Promise<SessionSubscriptionContext | null> {
    const subscriptionResult = await this.database.query<SubscriptionRow>(
      `
      select
        sp.id as plan_id,
        sp.code as plan_code,
        sp.name as plan_name,
        ts.expiration_date,
        ts.status_source
      from tenant_subscriptions ts
      inner join subscription_plans sp on sp.id = ts.plan_id
      where ts.tenant_id = $1
      limit 1
    `,
      [input.tenantId],
    );

    const subscriptionRow = subscriptionResult.rows[0];

    if (subscriptionRow === undefined) {
      return null;
    }

    const limitsResult = await this.database.query<PlanLimitRow>(
      `
      select
        capability_code,
        value_type,
        numeric_value,
        boolean_value
      from subscription_plan_limits
      where plan_id = $1
      order by capability_code asc
    `,
      [subscriptionRow.plan_id],
    );

    const expirationDate = toDateOnly(subscriptionRow.expiration_date);
    const daysUntilExpiration = calculateDaysUntilExpiration({
      expirationDate,
      tenantTimezone: input.tenantTimezone,
      now: input.now,
    });

    return {
      effectivePlan: {
        code: toAuthPlanCode(subscriptionRow.plan_code),
        name: subscriptionRow.plan_name,
        limits: mapPlanLimits(limitsResult.rows),
      },
      subscription: {
        status: input.tenantStatus,
        expiration_date: expirationDate,
        days_until_expiration: daysUntilExpiration,
        renewal_required: isRenewalRequired(input.tenantStatus) || daysUntilExpiration < 0,
        warnings: buildSubscriptionWarnings({
          tenantStatus: input.tenantStatus,
          daysUntilExpiration,
        }),
      },
      subscriptionStatusSource: toSubscriptionStatusSource(subscriptionRow.status_source),
    };
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

function toAuthPlanCode(value: string): AuthPlanCode {
  switch (value) {
    case 'basic':
    case 'mid':
    case 'high':
      return value;
    default:
      throw new Error(`Unsupported subscription plan code: ${value}`);
  }
}

function mapPlanLimits(rows: readonly PlanLimitRow[]): AuthEffectivePlanLimits {
  const dynamicLimits: Record<string, boolean | number | string | null> = {};

  for (const row of rows) {
    dynamicLimits[row.capability_code] = mapPlanLimitValue(row);
  }

  return {
    ...dynamicLimits,
    max_active_branches: toNumberLimit(dynamicLimits.max_active_branches),
    customer_email_reminders: toBooleanLimit(dynamicLimits.customer_email_reminders),
    customer_sms_reminders: toBooleanLimit(dynamicLimits.customer_sms_reminders),
  };
}

function mapPlanLimitValue(row: PlanLimitRow): boolean | number | string | null {
  switch (row.value_type) {
    case 'boolean':
      return row.boolean_value ?? false;
    case 'numeric':
      return row.numeric_value === null ? null : Number(row.numeric_value);
    default:
      return row.boolean_value ?? row.numeric_value ?? null;
  }
}

function toNumberLimit(value: boolean | number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function toBooleanLimit(value: boolean | number | string | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function calculateDaysUntilExpiration(input: {
  readonly expirationDate: string;
  readonly tenantTimezone: string;
  readonly now: Date;
}): number {
  const today = getDateOnlyInTimeZone(input.now, input.tenantTimezone);

  return Math.floor(
    (dateOnlyToUtcMilliseconds(input.expirationDate) - dateOnlyToUtcMilliseconds(today)) /
      MILLISECONDS_PER_DAY,
  );
}

function getDateOnlyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = getDateTimePart(parts, 'year');
  const month = getDateTimePart(parts, 'month');
  const day = getDateTimePart(parts, 'day');

  return `${year}-${month}-${day}`;
}

function getDateTimePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new Error(`Unable to resolve ${type} for tenant timezone date.`);
  }

  return part.value;
}

function toSubscriptionStatusSource(value: string): SubscriptionStatusSource {
  switch (value) {
    case 'system_computed':
    case 'platform_override':
      return value;
    default:
      throw new Error(`Unsupported subscription status source: ${value}`);
  }
}

function dateOnlyToUtcMilliseconds(dateOnly: string): number {
  const [yearText, monthText, dayText] = dateOnly.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid date-only value: ${dateOnly}`);
  }

  return Date.UTC(year, month - 1, day);
}

function isRenewalRequired(tenantStatus: AuthTenantStatus): boolean {
  switch (tenantStatus) {
    case 'grace_period':
    case 'read_only':
    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
      return true;
    case 'pending_setup':
    case 'active':
      return false;
  }
}

function buildSubscriptionWarnings(input: {
  readonly tenantStatus: AuthTenantStatus;
  readonly daysUntilExpiration: number;
}): readonly AuthSubscriptionWarning[] {
  const warnings: AuthSubscriptionWarning[] = [];

  switch (input.tenantStatus) {
    case 'grace_period':
      warnings.push({
        code: 'subscription_grace_period',
        message: 'Subscription is expired and currently in grace period.',
      });
      break;

    case 'read_only':
      warnings.push({
        code: 'subscription_read_only',
        message: 'Subscription is expired and tenant access is read-only.',
      });
      break;

    case 'suspended':
      warnings.push({
        code: 'subscription_suspended',
        message: 'Subscription is expired and tenant access is suspended.',
      });
      break;

    case 'pending_deletion':
      warnings.push({
        code: 'subscription_pending_deletion',
        message: 'Tenant is pending deletion due to subscription expiration.',
      });
      break;

    case 'deleted':
      warnings.push({
        code: 'tenant_deleted',
        message: 'Tenant has been deleted.',
      });
      break;

    case 'pending_setup':
    case 'active':
      break;
  }

  if (
    input.tenantStatus === 'active' &&
    input.daysUntilExpiration >= 0 &&
    input.daysUntilExpiration <= NEAR_EXPIRATION_WARNING_DAYS
  ) {
    warnings.push({
      code: 'subscription_near_expiration',
      message: 'Subscription is nearing expiration.',
    });
  }

  return warnings;
}
