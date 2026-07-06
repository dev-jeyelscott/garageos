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
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateExpenseCategoryRequest,
  ListExpenseCategoriesQuery,
  ExpenseCategoryStatusChangeRequest,
  UpdateExpenseCategoryRequest,
} from '../api/expense-category.schemas';
import {
  ExpenseCategoryStore,
  type ExpenseCategoryDeactivationBlocker,
  type ExpenseCategoryRecord,
  type ExpenseCategoryStatus,
} from './expense-category.store';

export interface ExpenseCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: ExpenseCategoryStatus;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface ExpenseCategoryListResponse {
  readonly expense_categories: readonly ExpenseCategoryResponse[];
}

export interface ExpenseCategoryDetailResponse {
  readonly expense_category: ExpenseCategoryResponse;
}

export interface ExpenseCategoryMutationResponse {
  readonly expense_category: ExpenseCategoryResponse;
}

interface NormalizedExpenseCategoryInput {
  readonly name: string;
  readonly normalizedName: string;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @Inject(ExpenseCategoryStore)
    private readonly expenseCategoryStore: ExpenseCategoryStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listExpenseCategories(
    query: ListExpenseCategoriesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertExpenseCategoryPermission(context, isShopOwner, 'expenses.read');

    const normalizedSearch = normalizeNullableText(query.q);
    const categories = await this.expenseCategoryStore.listExpenseCategories({
      tenantId: context.tenantId,
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      status: query.status,
      limit: query.limit,
    });

    return {
      expense_categories: categories.map(toExpenseCategoryResponse),
    };
  }

  async getExpenseCategory(
    categoryId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertExpenseCategoryPermission(context, isShopOwner, 'expenses.read');

    const category = await this.expenseCategoryStore.findExpenseCategoryById(
      context.tenantId,
      categoryId.trim(),
    );

    if (category === null) {
      throw GarageOsApiException.resourceNotFound('expense category was not found.');
    }

    return {
      expense_category: toExpenseCategoryResponse(category),
    };
  }

  async createExpenseCategory(
    request: CreateExpenseCategoryRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertExpenseCategoryPermission(context, isShopOwner, 'expense_categories.manage');

    const input = normalizeExpenseCategoryInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const createdAt = new Date();

      const category = await translateDuplicateExpenseCategoryName(async () =>
        this.expenseCategoryStore.createExpenseCategory(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            name: input.name,
            normalizedName: input.normalizedName,
            createdByUserId: context.actorUserId,
            createdAt,
          },
          transaction,
        ),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'expense_categories.created',
        entityType: 'expense_category',
        entityId: category.id,
        afterJson: toExpenseCategoryResponse(category),
        reason: 'expense_category_created',
        client: transaction,
      });

      return {
        expense_category: toExpenseCategoryResponse(category),
      };
    });
  }

  async updateExpenseCategory(
    categoryId: string,
    request: UpdateExpenseCategoryRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertExpenseCategoryPermission(context, isShopOwner, 'expense_categories.manage');

    const input = normalizeExpenseCategoryInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.expenseCategoryStore.findExpenseCategoryById(
        context.tenantId,
        categoryId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('expense category was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'expense_category_not_active',
            message: 'Only active expense categories can be updated.',
          },
        ]);
      }

      const updatedAt = new Date();
      const updated = await translateDuplicateExpenseCategoryName(async () =>
        this.expenseCategoryStore.updateExpenseCategory(
          {
            tenantId: context.tenantId,
            categoryId: existing.id,
            name: input.name,
            normalizedName: input.normalizedName,
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            updatedByUserId: context.actorUserId,
            updatedAt,
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
        action: 'expense_categories.updated',
        entityType: 'expense_category',
        entityId: updated.id,
        beforeJson: toExpenseCategoryResponse(existing),
        afterJson: toExpenseCategoryResponse(updated),
        reason: 'expense_category_updated',
        client: transaction,
      });

      return {
        expense_category: toExpenseCategoryResponse(updated),
      };
    });
  }

  async deactivateExpenseCategory(
    categoryId: string,
    request: ExpenseCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryMutationResponse> {
    return this.changeExpenseCategoryStatus(categoryId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      action: 'expense_categories.deactivated',
      fallbackReason: 'expense_category_deactivated',
    });
  }

  async reactivateExpenseCategory(
    categoryId: string,
    request: ExpenseCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseCategoryMutationResponse> {
    return this.changeExpenseCategoryStatus(categoryId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      action: 'expense_categories.reactivated',
      fallbackReason: 'expense_category_reactivated',
    });
  }

  private async changeExpenseCategoryStatus(
    categoryId: string,
    request: ExpenseCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: ExpenseCategoryStatus;
      readonly toStatus: ExpenseCategoryStatus;
      readonly action: string;
      readonly fallbackReason: string;
    },
  ): Promise<ExpenseCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertExpenseCategoryPermission(context, isShopOwner, 'expense_categories.manage');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.expenseCategoryStore.findExpenseCategoryById(
        context.tenantId,
        categoryId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('expense category was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_expense_category_status',
            message: `expense category must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const blockers = await this.expenseCategoryStore.findExpenseCategoryDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'category_id',
              code: `expense_category_deactivation_blocked_${blocker}`,
              message: `expense category deactivation is blocked by ${formatBlocker(blocker)}.`,
            })),
          );
        }
      }

      const changedAt = new Date();
      const changed = await translateDuplicateExpenseCategoryName(async () =>
        this.expenseCategoryStore.changeExpenseCategoryStatus(
          {
            tenantId: context.tenantId,
            categoryId: existing.id,
            fromStatus: options.fromStatus,
            toStatus: options.toStatus,
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            changedByUserId: context.actorUserId,
            changedAt,
          },
          transaction,
        ),
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: options.action,
        entityType: 'expense_category',
        entityId: changed.id,
        beforeJson: toExpenseCategoryResponse(existing),
        afterJson: toExpenseCategoryResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.fallbackReason,
        client: transaction,
      });

      return {
        expense_category: toExpenseCategoryResponse(changed),
      };
    });
  }
}

function normalizeExpenseCategoryInput(
  request: CreateExpenseCategoryRequest | UpdateExpenseCategoryRequest,
): NormalizedExpenseCategoryInput {
  return {
    name: normalizeWhitespace(request.name),
    normalizedName: normalizeSearchText(request.name),
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = normalizeWhitespace(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeSearchText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function toExpenseCategoryResponse(category: ExpenseCategoryRecord): ExpenseCategoryResponse {
  return {
    id: category.id,
    name: category.name,
    status: category.status,
    lock_version: category.lockVersion,
    created_at: category.createdAt.toISOString(),
    updated_at: category.updatedAt.toISOString(),
    deactivated_at: category.deactivatedAt?.toISOString() ?? null,
    reactivated_at: category.reactivatedAt?.toISOString() ?? null,
  };
}

function assertExpenseCategoryPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateExpenseCategoryName<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveExpenseCategoryNameUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active expense category with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isActiveExpenseCategoryNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint ===
      'ux_expense_categories_active_name'
  );
}

function formatBlocker(blocker: ExpenseCategoryDeactivationBlocker): string {
  return blocker.replaceAll('_', ' ');
}
