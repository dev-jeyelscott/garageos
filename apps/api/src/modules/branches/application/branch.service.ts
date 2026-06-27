import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  resolveTenantContextFromAuthenticatedSession,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  BranchStatusChangeRequest,
  CreateBranchRequest,
  UpdateBranchRequest,
} from '../api/branch.schemas';
import { BranchStore, type BranchSummaryRecord } from './branch.store';

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

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class BranchService {
  constructor(
    @Inject(BranchStore)
    private readonly branchStore: BranchStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async createBranch(
    request: CreateBranchRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchCreateResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.branchStore.isActiveShopOwner({
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
        this.branchStore.countActiveBranches(context.tenantId, transaction),
        this.branchStore.getEffectiveMaxActiveBranches(context.tenantId, transaction),
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
        this.branchStore.createBranch(
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
    const isShopOwner = await this.branchStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertBranchPermission(context, isShopOwner, 'branches.read');

    const branches = await this.branchStore.listBranches(context.tenantId);

    return {
      branches: branches.map(toBranchResponse),
    };
  }

  async getBranch(
    branchId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<BranchResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.branchStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertBranchPermission(context, isShopOwner, 'branches.read');

    const branch = await this.branchStore.findBranchById(context.tenantId, branchId.trim());

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
    const isShopOwner = await this.branchStore.isActiveShopOwner({
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
      const existing = await this.branchStore.findBranchById(
        context.tenantId,
        branchId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Branch was not found.');
      }

      const updated = await translateDuplicateBranchName(async () =>
        this.branchStore.updateBranch(
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
    const isShopOwner = await this.branchStore.isActiveShopOwner({
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
      const existing = await this.branchStore.findBranchById(
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
        const activeBranches = await this.branchStore.countActiveBranches(
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

        const blockers = await this.branchStore.findBranchDeactivationBlockers(
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
          this.branchStore.countActiveBranches(context.tenantId, transaction),
          this.branchStore.getEffectiveMaxActiveBranches(context.tenantId, transaction),
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
      const changed = await this.branchStore.changeBranchStatus(
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

      await this.branchStore.createBranchStatusEvent(
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
