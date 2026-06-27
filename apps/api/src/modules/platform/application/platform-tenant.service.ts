import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import type { AuthSessionResponseData } from '../../auth/contracts';
import type {
  CreatePlatformTenantRequest,
  ListPlatformTenantsQuery,
} from '../api/platform-tenant.schemas';
import {
  type PlatformPlanSummary,
  type PlatformSubscriptionSummary,
  type PlatformTenantDetailRecord,
  type PlatformTenantListRecord,
  type PlatformTenantOwnerInvitationSummary,
  type PlatformTenantStatus,
  PlatformTenantStore,
} from './platform-tenant.store';

export const PLATFORM_PERMISSIONS = {
  TENANTS_READ: 'platform.tenants.read',
  TENANTS_CREATE: 'platform.tenants.create',
  TENANTS_UPDATE: 'platform.tenants.update',
  SUBSCRIPTIONS_UPDATE: 'platform.subscriptions.update',
  PLANS_UPDATE: 'platform.plans.update',
  AUDIT_LOGS_READ: 'platform.audit_logs.read',
} as const;

export interface PlatformTenantListResponse {
  readonly tenants: readonly PlatformTenantSummaryResponse[];
  readonly pagination: {
    readonly limit: number;
    readonly next_cursor: string | null;
    readonly has_more: boolean;
  };
}

export interface PlatformTenantSummaryResponse {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email: string;
  readonly status: PlatformTenantStatus;
  readonly timezone: string;
  readonly country: string;
  readonly currency: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly lock_version: number;
  readonly plan: PlatformPlanResponse | null;
  readonly subscription: PlatformSubscriptionResponse | null;
  readonly owner: PlatformOwnerResponse | null;
  readonly owner_invitation: PlatformOwnerInvitationResponse | null;
}

export interface PlatformTenantDetailResponse extends PlatformTenantSummaryResponse {
  readonly onboarding_completed_at: string | null;
  readonly deletion_scheduled_for: string | null;
  readonly deleted_at: string | null;
}

export interface CreatePlatformTenantResponse {
  readonly tenant: {
    readonly id: string;
    readonly business_name: string;
    readonly status: 'pending_setup';
  };
  readonly subscription: PlatformSubscriptionResponse;
  readonly owner_invitation_sent: boolean;
}

interface PlatformPlanResponse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

interface PlatformSubscriptionResponse {
  readonly plan_id: string;
  readonly start_date: string;
  readonly expiration_date: string;
  readonly status_source: string;
  readonly last_renewal_at: string | null;
  readonly updated_by_platform_admin_user_id: string | null;
  readonly updated_at: string;
}

interface PlatformOwnerResponse {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly status: string;
}

interface PlatformOwnerInvitationResponse {
  readonly email: string;
  readonly status: string;
  readonly expires_at: string;
}

export interface PlatformRequestAuditContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

const DEFAULT_LIST_LIMIT = 50;
const OWNER_INVITATION_EXPIRES_IN_DAYS = 7;
const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class PlatformTenantService {
  constructor(
    @Inject(PlatformTenantStore)
    private readonly tenantStore: PlatformTenantStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(SecureTokenService)
    private readonly secureTokenService: SecureTokenService,
    @Inject(TokenHashingService)
    private readonly tokenHashingService: TokenHashingService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listTenants(
    query: ListPlatformTenantsQuery,
    session: AuthSessionResponseData,
  ): Promise<PlatformTenantListResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.TENANTS_READ);

    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const cursor = decodeTenantListCursor(query.cursor ?? null);
    const rows = await this.tenantStore.listTenants({
      limit: limit + 1,
      cursorCreatedAt: cursor?.createdAt ?? null,
      cursorId: cursor?.id ?? null,
      status: query.status ?? null,
      search: normalizeSearchQuery(query.q ?? null),
    });
    const visibleRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const lastRow = visibleRows.at(-1);

    return {
      tenants: visibleRows.map(toTenantSummaryResponse),
      pagination: {
        limit,
        has_more: hasMore,
        next_cursor: hasMore && lastRow !== undefined ? encodeTenantListCursor(lastRow) : null,
      },
    };
  }

  async getTenant(
    tenantId: string,
    session: AuthSessionResponseData,
  ): Promise<PlatformTenantDetailResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.TENANTS_READ);

    const tenant = await this.tenantStore.findTenantById(tenantId);

    if (tenant === null) {
      throw GarageOsApiException.resourceNotFound('Tenant was not found.');
    }

    return toTenantDetailResponse(tenant);
  }

  async createTenant(
    request: CreatePlatformTenantRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<CreatePlatformTenantResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.TENANTS_CREATE);

    const normalizedBusinessName = normalizeBusinessName(request.business_name);
    const normalizedShopEmail = normalizeEmail(request.shop_email);
    const normalizedOwnerEmail = normalizeEmail(request.owner.email);
    const startDate = validateDateOnly(request.subscription_start_date, 'subscription_start_date');
    const expirationDate = validateDateOnly(
      request.subscription_expiration_date,
      'subscription_expiration_date',
    );

    if (expirationDate.getTime() < startDate.getTime()) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'subscription_expiration_date',
          code: 'date_before_start',
          message: 'Subscription expiration date must be on or after start date.',
        },
      ]);
    }

    const platformAdminUserId = session.user.id;
    const now = new Date();
    const tenantId = randomUUID();
    const invitationId = randomUUID();
    const lifecycleEventId = randomUUID();
    const invitationToken = this.secureTokenService.generateOpaqueToken();
    const invitationExpiresAt = new Date(
      now.getTime() + OWNER_INVITATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const plan = await this.tenantStore.findActivePlanById(request.plan_id, transaction);

      if (plan === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'plan_id',
            code: 'active_plan_required',
            message: 'An active Basic, Mid, or High subscription plan is required.',
          },
        ]);
      }

      const duplicate = await this.tenantStore.findNonDeletedTenantByBusinessEmail(
        {
          normalizedBusinessName,
          normalizedShopEmail,
        },
        transaction,
      );

      if (duplicate !== null) {
        throw GarageOsApiException.duplicateResource(
          'A non-deleted tenant with the same business name and shop email already exists.',
        );
      }

      const tenant = await this.tenantStore.createTenant(
        {
          id: tenantId,
          businessName: request.business_name,
          normalizedBusinessName,
          shopEmail: request.shop_email,
          normalizedShopEmail,
          status: 'pending_setup',
          createdAt: now,
        },
        transaction,
      );

      const subscription = await this.tenantStore.createTenantSubscription(
        {
          tenantId,
          planId: plan.id,
          startDate: request.subscription_start_date,
          expirationDate: request.subscription_expiration_date,
          updatedByPlatformAdminUserId: platformAdminUserId,
          updatedAt: now,
        },
        transaction,
      );

      const invitation = await this.tenantStore.createOwnerInvitation(
        {
          id: invitationId,
          tenantId,
          email: request.owner.email,
          normalizedEmail: normalizedOwnerEmail,
          tokenHash: this.tokenHashingService.hashToken(invitationToken),
          status: 'pending',
          expiresAt: invitationExpiresAt,
          assignedRoleConfigJson: {
            role_type: 'shop_owner',
            protected_owner_capabilities: true,
          },
          assignedBranchConfigJson: {
            tenant_wide_branch_access: true,
            branch_ids: [],
          },
          createdByUserId: platformAdminUserId,
          createdAt: now,
        },
        transaction,
      );

      await this.tenantStore.createTenantLifecycleEvent(
        {
          id: lifecycleEventId,
          tenantId,
          fromStatus: null,
          toStatus: 'pending_setup',
          source: 'platform_admin',
          reason: 'platform_created_tenant',
          effectiveAt: now,
          createdAt: now,
        },
        transaction,
      );

      await this.auditTenantCreation({
        tenant,
        plan,
        subscription,
        invitation,
        session,
        auditContext,
        duplicateApprovalReason: request.duplicate_approval_reason ?? null,
        client: transaction,
      });

      return {
        tenant: {
          id: tenant.id,
          business_name: tenant.businessName,
          status: 'pending_setup',
        },
        subscription: toSubscriptionResponse(subscription),
        owner_invitation_sent: true,
      };
    });
  }

  assertPlatformPermission(session: AuthSessionResponseData, permission: string): void {
    if (session.user.user_type !== 'platform_admin') {
      throw GarageOsApiException.forbidden(permission);
    }

    if (!session.user.email_verified) {
      throw GarageOsApiException.forbidden(
        permission,
        'Platform admin email verification is required.',
      );
    }

    if (!session.effective_permissions.includes(permission)) {
      throw GarageOsApiException.forbidden(permission);
    }
  }

  private async auditTenantCreation(input: {
    readonly tenant: PlatformTenantDetailRecord;
    readonly plan: PlatformPlanSummary;
    readonly subscription: PlatformSubscriptionSummary;
    readonly invitation: PlatformTenantOwnerInvitationSummary;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly duplicateApprovalReason: string | null;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    const baseAudit = {
      tenantId: input.tenant.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
    } as const;

    await this.auditService.record({
      ...baseAudit,
      action: 'platform.tenant.created',
      entityType: 'tenant',
      entityId: input.tenant.id,
      afterJson: {
        business_name: input.tenant.businessName,
        shop_email: input.tenant.shopEmail,
        status: input.tenant.status,
        plan_id: input.plan.id,
        subscription_start_date: input.subscription.startDate,
        subscription_expiration_date: input.subscription.expirationDate,
      },
      reason: 'platform_created_tenant',
    });

    await this.auditService.record({
      ...baseAudit,
      action: 'platform.tenant_subscription.created',
      entityType: 'tenant_subscription',
      entityId: input.tenant.id,
      afterJson: {
        plan_id: input.plan.id,
        plan_code: input.plan.code,
        start_date: input.subscription.startDate,
        expiration_date: input.subscription.expirationDate,
        status_source: input.subscription.statusSource,
      },
      reason: 'platform_created_tenant_subscription_baseline',
    });

    await this.auditService.record({
      ...baseAudit,
      action: 'platform.owner_invitation.created',
      entityType: 'employee_invitation',
      metadataJson: {
        invitation_email: input.invitation.email,
        invitation_status: input.invitation.status,
        expires_at: input.invitation.expiresAt.toISOString(),
        role_type: 'shop_owner',
      },
      reason: 'platform_created_tenant_owner_invitation',
    });

    if (input.duplicateApprovalReason !== null) {
      await this.auditService.record({
        ...baseAudit,
        action: 'platform.tenant_duplicate_approval.not_applied',
        entityType: 'tenant',
        entityId: input.tenant.id,
        metadataJson: {
          reason: input.duplicateApprovalReason,
          schema_rule: 'duplicates_blocked_for_non_deleted_tenants',
        },
        reason: input.duplicateApprovalReason,
      });
    }
  }
}

function toTenantSummaryResponse(row: PlatformTenantListRecord): PlatformTenantSummaryResponse {
  return {
    id: row.id,
    business_name: row.businessName,
    shop_email: row.shopEmail,
    status: row.status,
    timezone: row.timezone,
    country: row.country,
    currency: row.currency,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    lock_version: row.lockVersion,
    plan: row.plan === null ? null : toPlanResponse(row.plan),
    subscription: row.subscription === null ? null : toSubscriptionResponse(row.subscription),
    owner:
      row.owner === null
        ? null
        : {
            id: row.owner.id,
            full_name: row.owner.fullName,
            email: row.owner.email,
            status: row.owner.status,
          },
    owner_invitation:
      row.ownerInvitation === null ? null : toOwnerInvitationResponse(row.ownerInvitation),
  };
}

function toTenantDetailResponse(row: PlatformTenantDetailRecord): PlatformTenantDetailResponse {
  return {
    ...toTenantSummaryResponse(row),
    onboarding_completed_at: row.onboardingCompletedAt?.toISOString() ?? null,
    deletion_scheduled_for: row.deletionScheduledFor?.toISOString() ?? null,
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function toPlanResponse(plan: PlatformPlanSummary): PlatformPlanResponse {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    status: plan.status,
  };
}

function toSubscriptionResponse(
  subscription: PlatformSubscriptionSummary,
): PlatformSubscriptionResponse {
  return {
    plan_id: subscription.planId,
    start_date: subscription.startDate,
    expiration_date: subscription.expirationDate,
    status_source: subscription.statusSource,
    last_renewal_at: subscription.lastRenewalAt?.toISOString() ?? null,
    updated_by_platform_admin_user_id: subscription.updatedByPlatformAdminUserId,
    updated_at: subscription.updatedAt.toISOString(),
  };
}

function toOwnerInvitationResponse(
  invitation: PlatformTenantOwnerInvitationSummary,
): PlatformOwnerInvitationResponse {
  return {
    email: invitation.email,
    status: invitation.status,
    expires_at: invitation.expiresAt.toISOString(),
  };
}

function normalizeBusinessName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSearchQuery(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ').toLowerCase();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function validateDateOnly(value: string, field: string): Date {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_date',
        message: 'Date must be a valid calendar date in YYYY-MM-DD format.',
      },
    ]);
  }

  return date;
}

function encodeTenantListCursor(row: PlatformTenantListRecord): string {
  return Buffer.from(
    JSON.stringify({
      created_at: row.createdAt.toISOString(),
      id: row.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeTenantListCursor(
  cursor: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (cursor === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      readonly created_at?: unknown;
      readonly id?: unknown;
    };

    if (typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor payload.');
    }

    const createdAt = new Date(parsed.created_at);

    if (Number.isNaN(createdAt.getTime()) || parsed.id.trim().length === 0) {
      throw new Error('Invalid cursor values.');
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    throw GarageOsApiException.validationFailed([
      {
        field: 'cursor',
        code: 'invalid_cursor',
        message: 'Cursor is invalid.',
      },
    ]);
  }
}
