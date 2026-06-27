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
  CreateProductCategoryRequest,
  ListProductCategoriesQuery,
  ProductCategoryStatusChangeRequest,
  UpdateProductCategoryRequest,
} from '../api/product-category.schemas';
import {
  ProductCategoryStore,
  type ProductCategoryDeactivationBlocker,
  type ProductCategoryRecord,
  type ProductCategoryStatus,
} from './product-category.store';

export interface ProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: ProductCategoryStatus;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface ProductCategoryListResponse {
  readonly product_categories: readonly ProductCategoryResponse[];
}

export interface ProductCategoryDetailResponse {
  readonly product_category: ProductCategoryResponse;
}

export interface ProductCategoryMutationResponse {
  readonly product_category: ProductCategoryResponse;
}

interface NormalizedProductCategoryInput {
  readonly name: string;
  readonly normalizedName: string;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ProductCategoriesService {
  constructor(
    @Inject(ProductCategoryStore)
    private readonly productCategoryStore: ProductCategoryStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listProductCategories(
    query: ListProductCategoriesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertProductCategoryPermission(context, isShopOwner, 'products.read');

    const normalizedSearch = normalizeNullableText(query.q);
    const categories = await this.productCategoryStore.listProductCategories({
      tenantId: context.tenantId,
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      status: query.status,
      limit: query.limit,
    });

    return {
      product_categories: categories.map(toProductCategoryResponse),
    };
  }

  async getProductCategory(
    categoryId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertProductCategoryPermission(context, isShopOwner, 'products.read');

    const category = await this.productCategoryStore.findProductCategoryById(
      context.tenantId,
      categoryId.trim(),
    );

    if (category === null) {
      throw GarageOsApiException.resourceNotFound('Product category was not found.');
    }

    return {
      product_category: toProductCategoryResponse(category),
    };
  }

  async createProductCategory(
    request: CreateProductCategoryRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductCategoryPermission(context, isShopOwner, 'product_categories.manage');

    const input = normalizeProductCategoryInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const createdAt = new Date();

      const category = await translateDuplicateProductCategoryName(async () =>
        this.productCategoryStore.createProductCategory(
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
        action: 'product_categories.created',
        entityType: 'product_category',
        entityId: category.id,
        afterJson: toProductCategoryResponse(category),
        reason: 'product_category_created',
        client: transaction,
      });

      return {
        product_category: toProductCategoryResponse(category),
      };
    });
  }

  async updateProductCategory(
    categoryId: string,
    request: UpdateProductCategoryRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductCategoryPermission(context, isShopOwner, 'product_categories.manage');

    const input = normalizeProductCategoryInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.productCategoryStore.findProductCategoryById(
        context.tenantId,
        categoryId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Product category was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'product_category_not_active',
            message: 'Only active product categories can be updated.',
          },
        ]);
      }

      const updatedAt = new Date();
      const updated = await translateDuplicateProductCategoryName(async () =>
        this.productCategoryStore.updateProductCategory(
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
        action: 'product_categories.updated',
        entityType: 'product_category',
        entityId: updated.id,
        beforeJson: toProductCategoryResponse(existing),
        afterJson: toProductCategoryResponse(updated),
        reason: 'product_category_updated',
        client: transaction,
      });

      return {
        product_category: toProductCategoryResponse(updated),
      };
    });
  }

  async deactivateProductCategory(
    categoryId: string,
    request: ProductCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryMutationResponse> {
    return this.changeProductCategoryStatus(categoryId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      action: 'product_categories.deactivated',
      fallbackReason: 'product_category_deactivated',
    });
  }

  async reactivateProductCategory(
    categoryId: string,
    request: ProductCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductCategoryMutationResponse> {
    return this.changeProductCategoryStatus(categoryId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      action: 'product_categories.reactivated',
      fallbackReason: 'product_category_reactivated',
    });
  }

  private async changeProductCategoryStatus(
    categoryId: string,
    request: ProductCategoryStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: ProductCategoryStatus;
      readonly toStatus: ProductCategoryStatus;
      readonly action: string;
      readonly fallbackReason: string;
    },
  ): Promise<ProductCategoryMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productCategoryStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductCategoryPermission(context, isShopOwner, 'product_categories.manage');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.productCategoryStore.findProductCategoryById(
        context.tenantId,
        categoryId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Product category was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_product_category_status',
            message: `Product category must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const blockers = await this.productCategoryStore.findProductCategoryDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'category_id',
              code: `product_category_deactivation_blocked_${blocker}`,
              message: `Product category deactivation is blocked by ${formatBlocker(blocker)}.`,
            })),
          );
        }
      }

      const changedAt = new Date();
      const changed = await translateDuplicateProductCategoryName(async () =>
        this.productCategoryStore.changeProductCategoryStatus(
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
        entityType: 'product_category',
        entityId: changed.id,
        beforeJson: toProductCategoryResponse(existing),
        afterJson: toProductCategoryResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.fallbackReason,
        client: transaction,
      });

      return {
        product_category: toProductCategoryResponse(changed),
      };
    });
  }
}

function normalizeProductCategoryInput(
  request: CreateProductCategoryRequest | UpdateProductCategoryRequest,
): NormalizedProductCategoryInput {
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

function toProductCategoryResponse(category: ProductCategoryRecord): ProductCategoryResponse {
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

function assertProductCategoryPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateProductCategoryName<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveProductCategoryNameUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active product category with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isActiveProductCategoryNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint ===
      'ux_product_categories_active_name'
  );
}

function formatBlocker(blocker: ProductCategoryDeactivationBlocker): string {
  return blocker.replaceAll('_', ' ');
}
