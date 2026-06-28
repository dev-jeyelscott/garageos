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
  CreateProductRequest,
  ListProductsQuery,
  ProductStatusChangeRequest,
  UpdateProductRequest,
} from '../api/product.schemas';
import {
  ProductStore,
  type ProductCategorySnapshot,
  type ProductDeactivationBlocker,
  type ProductRecord,
  type ProductStatus,
} from './product.store';

export interface ProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface ProductResponse {
  readonly id: string;
  readonly category_id: string;
  readonly category: ProductCategoryResponse;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly supplier_code: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly default_cost: string;
  readonly selling_price: string;
  readonly reorder_level: string;
  readonly description: string | null;
  readonly status: ProductStatus;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface ProductListResponse {
  readonly products: readonly ProductResponse[];
}

export interface ProductDetailResponse {
  readonly product: ProductResponse;
}

export interface ProductMutationResponse {
  readonly product: ProductResponse;
}

interface NormalizedProductInput {
  readonly categoryId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly sku: string;
  readonly normalizedSku: string;
  readonly barcode: string | null;
  readonly normalizedBarcode: string | null;
  readonly supplierCode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly defaultCost: string;
  readonly sellingPrice: string;
  readonly reorderLevel: string;
  readonly description: string | null;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listProducts(
    query: ListProductsQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertProductPermission(context, isShopOwner, 'products.read');

    const normalizedSearch = normalizeNullableText(query.q);
    const products = await this.productStore.listProducts({
      tenantId: context.tenantId,
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      categoryId: query.category_id ?? null,
      status: query.status,
      limit: query.limit,
    });

    return {
      products: products.map(toProductResponse),
    };
  }

  async getProduct(
    productId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertProductPermission(context, isShopOwner, 'products.read');

    const product = await this.productStore.findProductById(context.tenantId, productId.trim());

    if (product === null) {
      throw GarageOsApiException.resourceNotFound('Product was not found.');
    }

    return {
      product: toProductResponse(product),
    };
  }

  async createProduct(
    request: CreateProductRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductPermission(context, isShopOwner, 'products.create');

    const input = normalizeProductInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const category = await this.productStore.findActiveProductCategoryById(
        context.tenantId,
        input.categoryId,
        transaction,
      );

      assertActiveCategory(category);

      const createdAt = new Date();

      const product = await translateDuplicateProductConflict(async () =>
        this.productStore.createProduct(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            categoryId: input.categoryId,
            name: input.name,
            normalizedName: input.normalizedName,
            sku: input.sku,
            normalizedSku: input.normalizedSku,
            barcode: input.barcode,
            normalizedBarcode: input.normalizedBarcode,
            supplierCode: input.supplierCode,
            brand: input.brand,
            unitOfMeasure: input.unitOfMeasure,
            defaultCost: input.defaultCost,
            sellingPrice: input.sellingPrice,
            reorderLevel: input.reorderLevel,
            description: input.description,
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
        action: 'products.created',
        entityType: 'product',
        entityId: product.id,
        afterJson: toProductResponse(product),
        reason: 'product_created',
        client: transaction,
      });

      return {
        product: toProductResponse(product),
      };
    });
  }

  async updateProduct(
    productId: string,
    request: UpdateProductRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductPermission(context, isShopOwner, 'products.update');

    const input = normalizeProductInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.productStore.findProductById(
        context.tenantId,
        productId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Product was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'product_not_active',
            message: 'Only active products can be updated.',
          },
        ]);
      }

      const category = await this.productStore.findActiveProductCategoryById(
        context.tenantId,
        input.categoryId,
        transaction,
      );

      assertActiveCategory(category);

      const updatedAt = new Date();

      const updated = await translateDuplicateProductConflict(async () =>
        this.productStore.updateProduct(
          {
            tenantId: context.tenantId,
            productId: existing.id,
            categoryId: input.categoryId,
            name: input.name,
            normalizedName: input.normalizedName,
            sku: input.sku,
            normalizedSku: input.normalizedSku,
            barcode: input.barcode,
            normalizedBarcode: input.normalizedBarcode,
            supplierCode: input.supplierCode,
            brand: input.brand,
            unitOfMeasure: input.unitOfMeasure,
            defaultCost: input.defaultCost,
            sellingPrice: input.sellingPrice,
            reorderLevel: input.reorderLevel,
            description: input.description,
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
        action: 'products.updated',
        entityType: 'product',
        entityId: updated.id,
        beforeJson: toProductResponse(existing),
        afterJson: toProductResponse(updated),
        reason: 'product_updated',
        client: transaction,
      });

      return {
        product: toProductResponse(updated),
      };
    });
  }

  async deactivateProduct(
    productId: string,
    request: ProductStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductMutationResponse> {
    return this.changeProductStatus(productId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      requiredPermission: 'products.deactivate',
      action: 'products.deactivated',
      fallbackReason: 'product_deactivated',
    });
  }

  async reactivateProduct(
    productId: string,
    request: ProductStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ProductMutationResponse> {
    return this.changeProductStatus(productId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      requiredPermission: 'products.update',
      action: 'products.reactivated',
      fallbackReason: 'product_reactivated',
    });
  }

  private async changeProductStatus(
    productId: string,
    request: ProductStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: ProductStatus;
      readonly toStatus: ProductStatus;
      readonly requiredPermission: string;
      readonly action: string;
      readonly fallbackReason: string;
    },
  ): Promise<ProductMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertProductPermission(context, isShopOwner, options.requiredPermission);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.productStore.findProductById(
        context.tenantId,
        productId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Product was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_product_status',
            message: `Product must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const blockers = await this.productStore.findProductDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'product_id',
              code: `product_deactivation_blocked_${blocker}`,
              message: `Product deactivation is blocked by ${formatBlocker(blocker)}.`,
            })),
          );
        }
      }

      if (options.toStatus === 'active') {
        const category = await this.productStore.findActiveProductCategoryById(
          context.tenantId,
          existing.categoryId,
          transaction,
        );

        assertActiveCategory(category);
      }

      const changedAt = new Date();
      const changed = await translateDuplicateProductConflict(async () =>
        this.productStore.changeProductStatus(
          {
            tenantId: context.tenantId,
            productId: existing.id,
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
        entityType: 'product',
        entityId: changed.id,
        beforeJson: toProductResponse(existing),
        afterJson: toProductResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.fallbackReason,
        client: transaction,
      });

      return {
        product: toProductResponse(changed),
      };
    });
  }
}

function normalizeProductInput(
  request: CreateProductRequest | UpdateProductRequest,
): NormalizedProductInput {
  const barcode = normalizeNullableText(request.barcode);
  const sku = normalizeWhitespace(request.sku);

  return {
    categoryId: request.category_id.trim(),
    name: normalizeWhitespace(request.name),
    normalizedName: normalizeSearchText(request.name),
    sku,
    normalizedSku: normalizeSearchText(sku),
    barcode,
    normalizedBarcode: barcode === null ? null : normalizeSearchText(barcode),
    supplierCode: normalizeNullableText(request.supplier_code),
    brand: normalizeNullableText(request.brand),
    unitOfMeasure: normalizeWhitespace(request.unit_of_measure),
    defaultCost: request.default_cost,
    sellingPrice: request.selling_price,
    reorderLevel: request.reorder_level,
    description: normalizeNullableText(request.description),
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

function assertActiveCategory(category: ProductCategorySnapshot | null): void {
  if (category === null || category.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'category_id',
        code: 'active_product_category_required',
        message: 'An active product category is required.',
      },
    ]);
  }
}

function toProductResponse(product: ProductRecord): ProductResponse {
  return {
    id: product.id,
    category_id: product.categoryId,
    category: {
      id: product.category.id,
      name: product.category.name,
      status: product.category.status,
    },
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    supplier_code: product.supplierCode,
    brand: product.brand,
    unit_of_measure: product.unitOfMeasure,
    default_cost: product.defaultCost,
    selling_price: product.sellingPrice,
    reorder_level: product.reorderLevel,
    description: product.description,
    status: product.status,
    lock_version: product.lockVersion,
    created_at: product.createdAt.toISOString(),
    updated_at: product.updatedAt.toISOString(),
    deactivated_at: product.deactivatedAt?.toISOString() ?? null,
    reactivated_at: product.reactivatedAt?.toISOString() ?? null,
  };
}

function assertProductPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateProductConflict<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (
      isUniqueViolation(error, ['ux_products_tenant_sku', 'products_tenant_id_normalized_sku_key'])
    ) {
      throw GarageOsApiException.duplicateResource(
        'A product with this SKU already exists for this tenant.',
      );
    }

    if (isUniqueViolation(error, ['ux_products_active_barcode'])) {
      throw GarageOsApiException.duplicateResource(
        'An active product with this barcode already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isUniqueViolation(error: unknown, constraints: readonly string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    constraints.includes(String((error as { constraint?: unknown }).constraint))
  );
}

function formatBlocker(blocker: ProductDeactivationBlocker): string {
  return blocker.replaceAll('_', ' ');
}
