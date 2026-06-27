import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  BranchStatusChangeRequest,
  CreateBranchRequest,
  RenewalRequest,
  ShopProfileRequest,
  UpdateBranchRequest,
} from '../api/shop.schemas';
import { type BranchSummaryRecord, ShopStore } from './shop.store';

export interface OnboardingStateResponse {
  readonly tenant_status: string;
  readonly onboarding_completed: boolean;
  readonly requirements: {
    readonly shop_profile: boolean;
    readonly active_branch: boolean;
    readonly invoice_prefix: boolean;
    readonly tax_localization: boolean;
    readonly active_shop_owner: boolean;
    readonly subscription_plan: boolean;
    readonly subscription_expiration_date: boolean;
  };
  readonly missing_requirements: readonly string[];
  readonly can_complete_onboarding: boolean;
}

export interface BranchCreateResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active';
  readonly lock_version: number;
}

export interface BranchResponse {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly business_hours: unknown;
  readonly status: 'active' | 'inactive';
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface BranchListResponse {
  readonly branches: readonly BranchResponse[];
}

export interface CompleteOnboardingResponse {
  readonly tenant: {
    readonly id: string;
    readonly status: 'active';
    readonly onboarding_completed_at: string;
  };
}

export interface RenewalRequestResponse {
  readonly status: 'submitted';
  readonly instructions: string;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ShopService {
  constructor(
    @Inject(ShopStore)
    private readonly shopStore: ShopStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async getOnboardingState(
    session: TenantContextAuthenticatedSession,
  ): Promise<OnboardingStateResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    const state = await this.shopStore.getOnboardingState(context.tenantId);

    return toOnboardingStateResponse(state);
  }

  async upsertProfile(
    request: ShopProfileRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<{ readonly saved: true }> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    if (!isShopOwner && !context.effectivePermissions.includes('shop.update')) {
      throw GarageOsApiException.forbidden('shop.update');
    }

    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.shopStore.upsertShopProfile(
        {
          tenantId: context.tenantId,
          shopName: request.shop_name.trim(),
          address: request.address.trim(),
          contactNumber: request.contact_number.trim(),
          email: request.email.trim(),
          businessHoursJson: request.business_hours,
          taxProfile: request.tax_profile,
          taxMode: request.tax_mode,
          vatRate: request.vat_rate ?? 0.12,
          country: (request.country ?? 'PH').trim().toUpperCase(),
          timezone: request.timezone?.trim() ?? 'Asia/Manila',
          currency: (request.currency ?? 'PHP').trim().toUpperCase(),
          invoicePrefix: request.invoice_prefix.trim(),
          receiptFooterText: normalizeNullableText(request.receipt_footer_text),
          reminderSenderName: normalizeNullableText(request.reminder_sender_name),
          defaultInvoiceDueDays: request.default_invoice_due_days ?? 7,
          updatedAt: new Date(),
        },
        transaction,
      );
    });

    return { saved: true };
  }

  async createBranch(
    request: CreateBranchRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchCreateResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action:
        context.tenantStatus === TENANT_STATUSES.PENDING_SETUP
          ? TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP
          : TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    if (!isShopOwner && !context.effectivePermissions.includes('branches.create')) {
      throw GarageOsApiException.forbidden('branches.create');
    }

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const [activeBranches, maxActiveBranches] = await Promise.all([
        this.shopStore.countActiveBranches(context.tenantId, transaction),
        this.shopStore.getEffectiveMaxActiveBranches(context.tenantId, transaction),
      ]);

      if (activeBranches >= maxActiveBranches) {
        await this.auditService.record({
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
          action: 'branches.create.blocked_by_plan_limit',
          entityType: 'branch',
          metadataJson: {
            capability: 'max_active_branches',
            current_active_branches: activeBranches,
            limit: maxActiveBranches,
          },
          reason: 'plan_limit_exceeded',
          client: transaction,
        });

        throw GarageOsApiException.planLimitExceeded(
          'Your current plan does not allow another active branch.',
        );
      }

      const branchId = randomUUID();
      const branch = await translateDuplicateBranchName(async () =>
        this.shopStore.createBranch(
          {
            id: branchId,
            tenantId: context.tenantId,
            name: request.name.trim(),
            normalizedName: normalizeName(request.name),
            address: request.address.trim(),
            contactNumber: request.contact_number.trim(),
            businessHoursJson: request.business_hours,
            createdAt: new Date(),
          },
          transaction,
        ),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'branches.created',
        entityType: 'branch',
        entityId: branch.id,
        branchId: branch.id,
        afterJson: toBranchResponse(branch),
        reason: 'branch_created',
        client: transaction,
      });

      return {
        id: branch.id,
        name: branch.name,
        status: 'active',
        lock_version: branch.lockVersion,
      };
    });
  }

  async listBranches(session: TenantContextAuthenticatedSession): Promise<BranchListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertBranchPermission(context, isShopOwner, 'branches.read');

    const branches = await this.shopStore.listBranches(context.tenantId);

    return {
      branches: branches.map(toBranchResponse),
    };
  }

  async getBranch(
    branchId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertBranchPermission(context, isShopOwner, 'branches.read');

    const branch = await this.shopStore.findBranchById(context.tenantId, branchId.trim());

    if (branch === null) {
      throw GarageOsApiException.resourceNotFound('Branch was not found.');
    }

    return toBranchResponse(branch);
  }

  async updateBranch(
    branchId: string,
    request: UpdateBranchRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertBranchPermission(context, isShopOwner, 'branches.update');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.shopStore.findBranchById(
        context.tenantId,
        branchId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Branch was not found.');
      }

      const updated = await translateDuplicateBranchName(async () =>
        this.shopStore.updateBranch(
          {
            tenantId: context.tenantId,
            branchId: existing.id,
            name: request.name.trim(),
            normalizedName: normalizeName(request.name),
            address: request.address.trim(),
            contactNumber: request.contact_number.trim(),
            businessHoursJson: request.business_hours,
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            updatedAt: new Date(),
          },
          transaction,
        ),
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'branches.updated',
        entityType: 'branch',
        entityId: updated.id,
        branchId: updated.id,
        beforeJson: toBranchResponse(existing),
        afterJson: toBranchResponse(updated),
        reason: 'branch_updated',
        client: transaction,
      });

      return toBranchResponse(updated);
    });
  }

  async deactivateBranch(
    branchId: string,
    request: BranchStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchResponse> {
    return this.changeBranchStatus(branchId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      permission: 'branches.deactivate',
      action: 'branches.deactivated',
      reason: 'branch_deactivated',
    });
  }

  async reactivateBranch(
    branchId: string,
    request: BranchStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchResponse> {
    return this.changeBranchStatus(branchId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      permission: 'branches.reactivate',
      action: 'branches.reactivated',
      reason: 'branch_reactivated',
    });
  }

  async completeOnboarding(
    session: TenantContextAuthenticatedSession,
  ): Promise<CompleteOnboardingResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    if (!isShopOwner) {
      throw GarageOsApiException.forbidden('shop.update');
    }

    const now = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const state = await this.shopStore.getOnboardingState(context.tenantId, transaction);
      const response = toOnboardingStateResponse(state);

      if (!response.can_complete_onboarding) {
        throw GarageOsApiException.validationFailed(
          response.missing_requirements.map((requirement) => ({
            field: requirement,
            code: 'missing_onboarding_requirement',
            message: `Missing onboarding requirement: ${requirement}.`,
          })),
        );
      }

      if (context.tenantStatus !== TENANT_STATUSES.PENDING_SETUP) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'tenant.status',
            code: 'tenant_not_pending_setup',
            message: 'Only pending setup tenants can complete onboarding through this endpoint.',
          },
        ]);
      }

      await this.shopStore.markOnboardingComplete(
        {
          tenantId: context.tenantId,
          completedAt: now,
          lifecycleEventId: randomUUID(),
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'shop.onboarding.completed',
        entityType: 'tenant',
        entityId: context.tenantId,
        afterJson: {
          status: 'active',
          onboarding_completed_at: now.toISOString(),
        },
        reason: 'onboarding_requirements_complete',
        client: transaction,
      });

      return {
        tenant: {
          id: context.tenantId,
          status: 'active',
          onboarding_completed_at: now.toISOString(),
        },
      };
    });
  }

  async requestRenewal(
    request: RenewalRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<RenewalRequestResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.RENEWAL_REQUEST,
    });

    if (!isShopOwner) {
      throw GarageOsApiException.forbidden('shop.billing.update');
    }

    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.shopStore.createRenewalRequestAuditMarker(
        {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          requestedAt: new Date(),
          message: normalizeNullableText(request.message),
        },
        transaction,
      );
    });

    return {
      status: 'submitted',
      instructions:
        'Your renewal request was submitted. GarageOS does not process subscription payments inside the system. A platform admin must confirm external payment and update your subscription before access is restored to active.',
    };
  }

  private async changeBranchStatus(
    branchId: string,
    request: BranchStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: 'active' | 'inactive';
      readonly toStatus: 'active' | 'inactive';
      readonly permission: string;
      readonly action: string;
      readonly reason: string;
    },
  ): Promise<BranchResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertBranchPermission(context, isShopOwner, options.permission);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.shopStore.findBranchById(
        context.tenantId,
        branchId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Branch was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_branch_status',
            message: `Branch must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const activeBranches = await this.shopStore.countActiveBranches(
          context.tenantId,
          transaction,
        );

        if (activeBranches <= 1) {
          throw GarageOsApiException.validationFailed([
            {
              field: 'branch_id',
              code: 'last_active_branch',
              message: 'Tenant must keep at least one active branch.',
            },
          ]);
        }

        const blockers = await this.shopStore.findBranchDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'branch_id',
              code: `branch_deactivation_blocked_${blocker}`,
              message: `Branch deactivation is blocked by ${blocker.replaceAll('_', ' ')}.`,
            })),
          );
        }
      }

      if (options.toStatus === 'active') {
        const [activeBranches, maxActiveBranches] = await Promise.all([
          this.shopStore.countActiveBranches(context.tenantId, transaction),
          this.shopStore.getEffectiveMaxActiveBranches(context.tenantId, transaction),
        ]);

        if (activeBranches >= maxActiveBranches) {
          await this.auditService.record({
            tenantId: context.tenantId,
            actorUserId: context.actorUserId,
            actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
            action: 'branches.reactivate.blocked_by_plan_limit',
            entityType: 'branch',
            entityId: existing.id,
            branchId: existing.id,
            metadataJson: {
              capability: 'max_active_branches',
              current_active_branches: activeBranches,
              limit: maxActiveBranches,
            },
            reason: 'plan_limit_exceeded',
            client: transaction,
          });

          throw GarageOsApiException.planLimitExceeded(
            'Your current plan does not allow another active branch.',
          );
        }
      }

      const changedAt = new Date();
      const changed = await this.shopStore.changeBranchStatus(
        {
          tenantId: context.tenantId,
          branchId: existing.id,
          fromStatus: options.fromStatus,
          toStatus: options.toStatus,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          changedAt,
        },
        transaction,
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.shopStore.createBranchStatusEvent(
        {
          tenantId: context.tenantId,
          branchId: existing.id,
          fromStatus: options.fromStatus,
          toStatus: options.toStatus,
          reason: normalizeNullableText(request.reason),
          createdByUserId: context.actorUserId,
          createdAt: changedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: options.action,
        entityType: 'branch',
        entityId: changed.id,
        branchId: changed.id,
        beforeJson: toBranchResponse(existing),
        afterJson: toBranchResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.reason,
        client: transaction,
      });

      return toBranchResponse(changed);
    });
  }
}

function toOnboardingStateResponse(state: {
  readonly tenantStatus: string;
  readonly onboardingCompletedAt: Date | null;
  readonly profileComplete: boolean;
  readonly activeBranchCount: number;
  readonly activeOwnerCount: number;
  readonly hasSubscriptionPlan: boolean;
  readonly hasSubscriptionExpirationDate: boolean;
}): OnboardingStateResponse {
  const requirements = {
    shop_profile: state.profileComplete,
    active_branch: state.activeBranchCount > 0,
    invoice_prefix: state.profileComplete,
    tax_localization: state.profileComplete,
    active_shop_owner: state.activeOwnerCount > 0,
    subscription_plan: state.hasSubscriptionPlan,
    subscription_expiration_date: state.hasSubscriptionExpirationDate,
  };

  const missingRequirements = Object.entries(requirements)
    .filter(([, satisfied]) => !satisfied)
    .map(([requirement]) => requirement);

  return {
    tenant_status: state.tenantStatus,
    onboarding_completed: state.onboardingCompletedAt !== null,
    requirements,
    missing_requirements: missingRequirements,
    can_complete_onboarding: missingRequirements.length === 0,
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toBranchResponse(branch: BranchSummaryRecord): BranchResponse {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    contact_number: branch.contactNumber,
    business_hours: branch.businessHoursJson,
    status: branch.status,
    lock_version: branch.lockVersion,
    created_at: branch.createdAt.toISOString(),
    updated_at: branch.updatedAt.toISOString(),
    deactivated_at: branch.deactivatedAt?.toISOString() ?? null,
    reactivated_at: branch.reactivatedAt?.toISOString() ?? null,
  };
}

function assertBranchPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateBranchName<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveBranchNameUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active branch with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isActiveBranchNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint === 'ux_branches_active_name'
  );
}
