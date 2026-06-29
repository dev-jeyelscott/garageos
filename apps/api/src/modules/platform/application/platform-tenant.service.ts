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
  ApplyPlatformTenantReadOnlyOverrideRequest,
  ApplyPlatformTenantSuspensionRequest,
  CreatePlatformTenantRequest,
  ListPlatformTenantsQuery,
  QueuePlatformTenantExportRequest,
  StartPlatformSupportAccessSessionRequest,
  UpdatePlatformTenantSubscriptionRequest,
  QueuePlatformTenantDeletionJobRequest,
} from '../api/platform-tenant.schemas';
import {
  type PlatformPlanSummary,
  type PlatformSubscriptionSummary,
  type PlatformSupportAccessSessionSummary,
  type PlatformTenantDetailRecord,
  type PlatformTenantExportJobSummary,
  type PlatformTenantListRecord,
  type PlatformTenantOwnerInvitationSummary,
  type PlatformTenantStatus,
  type PlatformTenantDeletionJobSummary,
  PlatformTenantStore,
} from './platform-tenant.store';

export const PLATFORM_PERMISSIONS = {
  TENANTS_READ: 'platform.tenants.read',
  TENANTS_CREATE: 'platform.tenants.create',
  TENANTS_UPDATE: 'platform.tenants.update',
  SUBSCRIPTIONS_UPDATE: 'platform.subscriptions.update',
  PLANS_UPDATE: 'platform.plans.update',
  SUPPORT_ACCESS: 'platform.support_access',
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

export interface UpdatePlatformTenantSubscriptionResponse {
  readonly subscription: PlatformSubscriptionResponse;
}

export interface ApplyPlatformTenantReadOnlyOverrideResponse {
  readonly tenant: PlatformTenantDetailResponse;
}

export interface ApplyPlatformTenantSuspensionResponse {
  readonly tenant: PlatformTenantDetailResponse;
}

export interface StartPlatformSupportAccessSessionResponse {
  readonly support_access_session: PlatformSupportAccessSessionResponse;
}

export interface QueuePlatformTenantExportResponse {
  readonly export_job: PlatformTenantExportJobResponse;
}

export interface QueuePlatformTenantDeletionJobResponse {
  readonly deletion_job: PlatformTenantDeletionJobResponse;
}

interface PlatformTenantDeletionJobResponse {
  readonly id: string;
  readonly tenant_id: string;
  readonly scheduled_for: string;
  readonly status: string;
  readonly created_at: string;
}

interface PlatformTenantExportJobResponse {
  readonly id: string;
  readonly tenant_id: string;
  readonly job_type: string;
  readonly status: string;
  readonly requested_at: string;
  readonly run_after: string;
  readonly include_attachments: boolean;
}

interface PlatformSupportAccessSessionResponse {
  readonly id: string;
  readonly tenant_id: string;
  readonly platform_admin_user_id: string;
  readonly mode: string;
  readonly reason: string;
  readonly started_at: string;
  readonly expires_at: string;
  readonly ended_at: string | null;
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

    const duplicateApprovalReason = normalizeDuplicateApproval(request);

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

      if (duplicate !== null && duplicateApprovalReason === null) {
        throw GarageOsApiException.duplicateResource(
          'A non-deleted tenant with the same business name and shop email already exists.',
        );
      }

      let tenant: PlatformTenantDetailRecord;

      try {
        tenant = await this.tenantStore.createTenant(
          {
            id: tenantId,
            businessName: request.business_name,
            normalizedBusinessName,
            shopEmail: request.shop_email,
            normalizedShopEmail,
            status: 'pending_setup',
            duplicateApprovedAt: duplicateApprovalReason === null ? null : now,
            duplicateApprovedByPlatformAdminUserId:
              duplicateApprovalReason === null ? null : platformAdminUserId,
            duplicateApprovalReason,
            createdAt: now,
          },
          transaction,
        );
      } catch (error) {
        if (isUnapprovedTenantDuplicateConstraintViolation(error)) {
          throw GarageOsApiException.duplicateResource(
            'A non-deleted tenant with the same business name and shop email already exists.',
          );
        }

        throw error;
      }

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
        duplicateApprovalReason,
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

  async updateTenantSubscription(
    tenantId: string,
    request: UpdatePlatformTenantSubscriptionRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<UpdatePlatformTenantSubscriptionResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE);

    const reason = normalizeRequiredReason(request.reason, 'reason');
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

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

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

      const previousSubscription = tenant.subscription;

      const subscription = await this.tenantStore.upsertTenantSubscription(
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

      await this.auditTenantSubscriptionUpdate({
        tenant,
        plan,
        previousSubscription,
        subscription,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        subscription: toSubscriptionResponse(subscription),
      };
    });
  }

  async applyTenantReadOnlyOverride(
    tenantId: string,
    request: ApplyPlatformTenantReadOnlyOverrideRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<ApplyPlatformTenantReadOnlyOverrideResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE);

    const reason = normalizeRequiredReason(request.reason, 'reason');
    const expiresAt = normalizeOptionalTimestamp(request.expires_at ?? null, 'expires_at');
    const platformAdminUserId = session.user.id;
    const now = new Date();
    const overrideId = randomUUID();
    const lifecycleEventId = randomUUID();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status === 'deleted') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Deleted tenants cannot receive read-only overrides.',
        );
      }

      const updatedTenant =
        tenant.status === 'read_only'
          ? tenant
          : await this.tenantStore.updateTenantStatus(
              {
                tenantId,
                status: 'read_only',
                updatedAt: now,
              },
              transaction,
            );

      await this.tenantStore.createSubscriptionOverride(
        {
          id: overrideId,
          tenantId,
          overrideType: 'read_only',
          previousValueJson: {
            status: tenant.status,
          },
          newValueJson: {
            status: 'read_only',
            expires_at: expiresAt?.toISOString() ?? null,
          },
          reason,
          effectiveAt: now,
          expiresAt,
          createdByPlatformAdminUserId: platformAdminUserId,
          createdAt: now,
        },
        transaction,
      );

      if (tenant.status !== 'read_only') {
        await this.tenantStore.createTenantLifecycleEvent(
          {
            id: lifecycleEventId,
            tenantId,
            fromStatus: tenant.status,
            toStatus: 'read_only',
            source: 'platform_admin',
            reason,
            effectiveAt: now,
            createdAt: now,
          },
          transaction,
        );
      }

      await this.auditTenantReadOnlyOverride({
        tenantBefore: tenant,
        tenantAfter: updatedTenant,
        expiresAt,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        tenant: toTenantDetailResponse(updatedTenant),
      };
    });
  }

  async applyTenantSuspension(
    tenantId: string,
    request: ApplyPlatformTenantSuspensionRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<ApplyPlatformTenantSuspensionResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE);

    const reason = normalizeRequiredReason(request.reason, 'reason');
    const expiresAt = normalizeOptionalTimestamp(request.expires_at ?? null, 'expires_at');
    const platformAdminUserId = session.user.id;
    const now = new Date();
    const overrideId = randomUUID();
    const lifecycleEventId = randomUUID();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status === 'deleted') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Deleted tenants cannot receive suspension overrides.',
        );
      }

      const updatedTenant =
        tenant.status === 'suspended'
          ? tenant
          : await this.tenantStore.updateTenantStatus(
              {
                tenantId,
                status: 'suspended',
                updatedAt: now,
              },
              transaction,
            );

      await this.tenantStore.createSubscriptionOverride(
        {
          id: overrideId,
          tenantId,
          overrideType: 'suspended',
          previousValueJson: {
            status: tenant.status,
          },
          newValueJson: {
            status: 'suspended',
            expires_at: expiresAt?.toISOString() ?? null,
          },
          reason,
          effectiveAt: now,
          expiresAt,
          createdByPlatformAdminUserId: platformAdminUserId,
          createdAt: now,
        },
        transaction,
      );

      if (tenant.status !== 'suspended') {
        await this.tenantStore.createTenantLifecycleEvent(
          {
            id: lifecycleEventId,
            tenantId,
            fromStatus: tenant.status,
            toStatus: 'suspended',
            source: 'platform_admin',
            reason,
            effectiveAt: now,
            createdAt: now,
          },
          transaction,
        );
      }

      await this.auditTenantSuspension({
        tenantBefore: tenant,
        tenantAfter: updatedTenant,
        expiresAt,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        tenant: toTenantDetailResponse(updatedTenant),
      };
    });
  }

  async queueTenantExport(
    tenantId: string,
    request: QueuePlatformTenantExportRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<QueuePlatformTenantExportResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.TENANTS_UPDATE);

    const reason = normalizeRequiredReason(request.reason, 'reason');
    const includeAttachments = request.include_attachments === true;
    const platformAdminUserId = session.user.id;
    const now = new Date();
    const exportJobId = randomUUID();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status === 'deleted') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Deleted tenants cannot receive export jobs.',
        );
      }

      if (tenant.status === 'pending_deletion') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Tenant export is disabled while the tenant is pending deletion unless an emergency extension is granted.',
        );
      }

      const exportJob = await this.tenantStore.queueTenantExportJob(
        {
          id: exportJobId,
          tenantId,
          payloadJson: {
            tenant_id: tenantId,
            requested_by_platform_admin_user_id: platformAdminUserId,
            reason,
            include_attachments: includeAttachments,
            requested_at: now.toISOString(),
          },
          runAfter: now,
          maxAttempts: 3,
          correlationId: null,
        },
        transaction,
      );

      await this.auditTenantExportQueued({
        tenant,
        exportJob,
        includeAttachments,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        export_job: toTenantExportJobResponse(exportJob, includeAttachments),
      };
    });
  }

  async queueTenantDeletionJob(
    tenantId: string,
    request: QueuePlatformTenantDeletionJobRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<QueuePlatformTenantDeletionJobResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.TENANTS_UPDATE);

    const reason = normalizeRequiredReason(request.reason, 'reason');
    const now = new Date();
    const deletionJobId = randomUUID();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status === 'deleted') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Deleted tenants cannot receive deletion jobs.',
        );
      }

      if (tenant.status !== 'pending_deletion') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only tenants in pending_deletion status can receive deletion jobs.',
        );
      }

      if (tenant.deletionScheduledFor === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Pending deletion tenants must have deletion_scheduled_for before a deletion job can be queued.',
        );
      }

      const activeDeletionJob = await this.tenantStore.findActiveTenantDeletionJobByTenantId(
        tenantId,
        transaction,
      );

      if (activeDeletionJob !== null) {
        throw GarageOsApiException.duplicateResource(
          'An active tenant deletion job already exists for this tenant.',
        );
      }

      const deletionJob = await this.tenantStore.queueTenantDeletionJob(
        {
          id: deletionJobId,
          tenantId,
          scheduledFor: tenant.deletionScheduledFor,
          status: 'queued',
          createdAt: now,
        },
        transaction,
      );

      await this.auditTenantDeletionQueued({
        tenant,
        deletionJob,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        deletion_job: toTenantDeletionJobResponse(deletionJob),
      };
    });
  }

  async startSupportAccessSession(
    tenantId: string,
    request: StartPlatformSupportAccessSessionRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ): Promise<StartPlatformSupportAccessSessionResponse> {
    this.assertPlatformPermission(session, PLATFORM_PERMISSIONS.SUPPORT_ACCESS);

    const reason = normalizeRequiredReason(request.reason, 'reason');
    const expiresAt = normalizeRequiredTimestamp(request.expires_at, 'expires_at');
    const now = new Date();

    if (expiresAt.getTime() <= now.getTime()) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'expires_at',
          code: 'must_be_future',
          message: 'Support access expiration must be in the future.',
        },
      ]);
    }

    const supportAccessSessionId = randomUUID();
    const platformAdminUserId = session.user.id;

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status === 'deleted') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Deleted tenants cannot receive support access sessions.',
        );
      }

      const supportAccessSession = await this.tenantStore.createPlatformSupportAccessSession(
        {
          id: supportAccessSessionId,
          tenantId,
          platformAdminUserId,
          accessMode: request.mode,
          reason,
          startedAt: now,
          expiresAt,
        },
        transaction,
      );

      await this.auditSupportAccessSessionStarted({
        tenant,
        supportAccessSession,
        session,
        auditContext,
        reason,
        client: transaction,
      });

      return {
        support_access_session: toSupportAccessSessionResponse(supportAccessSession),
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
        action: 'platform.tenant_duplicate_approval.applied',
        entityType: 'tenant',
        entityId: input.tenant.id,
        metadataJson: {
          duplicate_approved_at: input.tenant.duplicateApprovedAt?.toISOString() ?? null,
          duplicate_approved_by_platform_admin_user_id:
            input.tenant.duplicateApprovedByPlatformAdminUserId,
          duplicate_approval_reason: input.duplicateApprovalReason,
        },
        reason: input.duplicateApprovalReason,
      });
    }
  }

  private async auditTenantSubscriptionUpdate(input: {
    readonly tenant: PlatformTenantDetailRecord;
    readonly plan: PlatformPlanSummary;
    readonly previousSubscription: PlatformSubscriptionSummary | null;
    readonly subscription: PlatformSubscriptionSummary;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenant.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.tenant_subscription.updated',
      entityType: 'tenant_subscription',
      entityId: input.tenant.id,
      beforeJson:
        input.previousSubscription === null
          ? null
          : toSubscriptionAuditJson(input.previousSubscription),
      afterJson: {
        ...toSubscriptionAuditJson(input.subscription),
        plan_code: input.plan.code,
      },
      reason: input.reason,
    });
  }

  private async auditTenantReadOnlyOverride(input: {
    readonly tenantBefore: PlatformTenantDetailRecord;
    readonly tenantAfter: PlatformTenantDetailRecord;
    readonly expiresAt: Date | null;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenantAfter.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.tenant_read_only_override.applied',
      entityType: 'tenant',
      entityId: input.tenantAfter.id,
      beforeJson: {
        status: input.tenantBefore.status,
      },
      afterJson: {
        status: input.tenantAfter.status,
        expires_at: input.expiresAt?.toISOString() ?? null,
      },
      metadataJson: {
        override_type: 'read_only',
      },
      reason: input.reason,
    });
  }

  private async auditTenantSuspension(input: {
    readonly tenantBefore: PlatformTenantDetailRecord;
    readonly tenantAfter: PlatformTenantDetailRecord;
    readonly expiresAt: Date | null;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenantAfter.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.tenant_suspension.applied',
      entityType: 'tenant',
      entityId: input.tenantAfter.id,
      beforeJson: {
        status: input.tenantBefore.status,
      },
      afterJson: {
        status: input.tenantAfter.status,
        expires_at: input.expiresAt?.toISOString() ?? null,
      },
      metadataJson: {
        override_type: 'suspended',
      },
      reason: input.reason,
    });
  }

  private async auditTenantExportQueued(input: {
    readonly tenant: PlatformTenantDetailRecord;
    readonly exportJob: PlatformTenantExportJobSummary;
    readonly includeAttachments: boolean;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenant.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.tenant_export.queued',
      entityType: 'background_job',
      entityId: input.exportJob.id,
      afterJson: {
        tenant_id: input.tenant.id,
        job_id: input.exportJob.id,
        job_type: input.exportJob.jobType,
        status: input.exportJob.status,
        include_attachments: input.includeAttachments,
        run_after: input.exportJob.runAfter.toISOString(),
        requested_at: input.exportJob.createdAt.toISOString(),
      },
      metadataJson: {
        tenant_status: input.tenant.status,
        tenant_business_name: input.tenant.businessName,
      },
      reason: input.reason,
    });
  }

  private async auditTenantDeletionQueued(input: {
    readonly tenant: PlatformTenantDetailRecord;
    readonly deletionJob: PlatformTenantDeletionJobSummary;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenant.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.tenant_deletion.queued',
      entityType: 'tenant_deletion_job',
      entityId: input.deletionJob.id,
      afterJson: {
        tenant_id: input.tenant.id,
        deletion_job_id: input.deletionJob.id,
        status: input.deletionJob.status,
        scheduled_for: input.deletionJob.scheduledFor.toISOString(),
        queued_at: input.deletionJob.createdAt.toISOString(),
      },
      metadataJson: {
        tenant_status: input.tenant.status,
        tenant_business_name: input.tenant.businessName,
      },
      reason: input.reason,
    });
  }

  private async auditSupportAccessSessionStarted(input: {
    readonly tenant: PlatformTenantDetailRecord;
    readonly supportAccessSession: PlatformSupportAccessSessionSummary;
    readonly session: AuthSessionResponseData;
    readonly auditContext: PlatformRequestAuditContext;
    readonly reason: string;
    readonly client: DatabaseQueryClient;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.tenant.id,
      actorUserId: input.session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      supportAccessSessionId: input.supportAccessSession.id,
      ipAddress: input.auditContext.ipAddress,
      userAgent: input.auditContext.userAgent,
      client: input.client,
      action: 'platform.support_access_session.started',
      entityType: 'platform_support_access_session',
      entityId: input.supportAccessSession.id,
      afterJson: {
        tenant_id: input.tenant.id,
        platform_admin_user_id: input.supportAccessSession.platformAdminUserId,
        mode: input.supportAccessSession.accessMode,
        started_at: input.supportAccessSession.startedAt.toISOString(),
        expires_at: input.supportAccessSession.expiresAt.toISOString(),
        ended_at: input.supportAccessSession.endedAt?.toISOString() ?? null,
      },
      metadataJson: {
        tenant_status: input.tenant.status,
        tenant_business_name: input.tenant.businessName,
      },
      reason: input.reason,
    });
  }
}

function normalizeDuplicateApproval(request: CreatePlatformTenantRequest): string | null {
  const approveDuplicate = request.approve_duplicate === true;
  const duplicateApprovalReason =
    typeof request.duplicate_approval_reason === 'string'
      ? request.duplicate_approval_reason.trim()
      : '';

  if (approveDuplicate && duplicateApprovalReason.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'duplicate_approval_reason',
        code: 'required',
        message: 'Duplicate approval reason is required when approving a duplicate tenant.',
      },
    ]);
  }

  if (!approveDuplicate && duplicateApprovalReason.length > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'approve_duplicate',
        code: 'required',
        message: 'approve_duplicate must be true when duplicate_approval_reason is provided.',
      },
    ]);
  }

  return approveDuplicate ? duplicateApprovalReason : null;
}

function isUnapprovedTenantDuplicateConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeDatabaseError = error as {
    readonly code?: unknown;
    readonly constraint?: unknown;
  };

  return (
    maybeDatabaseError.code === '23505' &&
    (maybeDatabaseError.constraint === 'ux_tenants_unapproved_business_email' ||
      maybeDatabaseError.constraint === 'ux_tenants_active_business_email')
  );
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

function toSupportAccessSessionResponse(
  supportAccessSession: PlatformSupportAccessSessionSummary,
): PlatformSupportAccessSessionResponse {
  return {
    id: supportAccessSession.id,
    tenant_id: supportAccessSession.tenantId,
    platform_admin_user_id: supportAccessSession.platformAdminUserId,
    mode: supportAccessSession.accessMode,
    reason: supportAccessSession.reason,
    started_at: supportAccessSession.startedAt.toISOString(),
    expires_at: supportAccessSession.expiresAt.toISOString(),
    ended_at: supportAccessSession.endedAt?.toISOString() ?? null,
  };
}

function toTenantExportJobResponse(
  exportJob: PlatformTenantExportJobSummary,
  includeAttachments: boolean,
): PlatformTenantExportJobResponse {
  return {
    id: exportJob.id,
    tenant_id: exportJob.tenantId ?? '',
    job_type: exportJob.jobType,
    status: exportJob.status,
    requested_at: exportJob.createdAt.toISOString(),
    run_after: exportJob.runAfter.toISOString(),
    include_attachments: includeAttachments,
  };
}

function toTenantDeletionJobResponse(
  deletionJob: PlatformTenantDeletionJobSummary,
): PlatformTenantDeletionJobResponse {
  return {
    id: deletionJob.id,
    tenant_id: deletionJob.tenantId,
    scheduled_for: deletionJob.scheduledFor.toISOString(),
    status: deletionJob.status,
    created_at: deletionJob.createdAt.toISOString(),
  };
}

function toSubscriptionAuditJson(
  subscription: PlatformSubscriptionSummary,
): Record<string, string | null> {
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

function normalizeRequiredReason(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: 'Reason is required.',
      },
    ]);
  }

  return normalizedValue;
}

function normalizeOptionalTimestamp(value: string | null, field: string): Date | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  const timestamp = Date.parse(normalizedValue);

  if (Number.isNaN(timestamp)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_datetime',
        message: 'Timestamp must be a valid date-time value.',
      },
    ]);
  }

  return new Date(timestamp);
}

function normalizeRequiredTimestamp(value: string, field: string): Date {
  const timestamp = normalizeOptionalTimestamp(value, field);

  if (timestamp === null) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: 'Expiration timestamp is required.',
      },
    ]);
  }

  return timestamp;
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
