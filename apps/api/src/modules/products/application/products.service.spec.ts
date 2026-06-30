import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import { AuditService } from '../../../shared/audit/audit.service';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import {
  ProductStore,
  type ChangeProductStatusInput,
  type CreateProductInput,
  type ListProductsInput,
  type ProductCategorySnapshot,
  type ProductDeactivationBlocker,
  type ProductRecord,
  type UpdateProductInput,
} from './product.store';
import { ProductsService } from './products.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('ProductsService', () => {
  it('requires products.read permission for listing when user is not shop owner', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(
      service.listProducts(
        { q: 'oil', category_id: CATEGORY_ID, status: 'active', limit: 50 },
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'products.read' }],
    });
  });

  it('lists tenant-scoped products with normalized search', async () => {
    const { service, store } = createService();
    store.products = [createProductRecord()];

    const response = await service.listProducts(
      { q: ' Engine   Oil ', category_id: CATEGORY_ID, status: 'active', limit: 25 },
      createTenantSession(['products.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'engine oil',
      categoryId: CATEGORY_ID,
      status: 'active',
      limit: 25,
    });
    expect(response.products[0]).toMatchObject({
      id: PRODUCT_ID,
      name: 'Engine Oil 10W-40 1L',
      sku: 'OIL-10W40-1L',
      status: 'active',
    });
  });

  it('blocks product creation for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createProduct(
        createProductRequest(),
        createTenantSession(['products.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('creates product with normalized identifiers and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createProduct(
        createProductRequest({
          name: ' Engine   Oil 10W-40 1L ',
          sku: ' OIL-10W40-1L ',
          barcode: ' 4800000000012 ',
        }),
        createTenantSession(['products.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        categoryId: CATEGORY_ID,
        name: 'Engine Oil 10W-40 1L',
        normalizedName: 'engine oil 10w-40 1l',
        sku: 'OIL-10W40-1L',
        normalizedSku: 'oil-10w40-1l',
        barcode: '4800000000012',
        normalizedBarcode: '4800000000012',
        createdByUserId: USER_ID,
      });
      expect(response.product).toMatchObject({
        id: PRODUCT_ID,
        sku: 'OIL-10W40-1L',
        status: 'active',
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'products.created',
          entityType: 'product',
          entityId: PRODUCT_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks product creation when category is inactive or missing', async () => {
    const { service, store } = createService();
    store.activeCategory = null;

    await expect(
      service.createProduct(createProductRequest(), createTenantSession(['products.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'category_id',
          code: 'active_product_category_required',
        }),
      ],
    });
  });

  it('returns version_conflict when product lock version is stale on update', async () => {
    const { service, store } = createService();
    store.productById = createProductRecord();
    store.updatedProduct = null;

    await expect(
      service.updateProduct(
        PRODUCT_ID,
        createUpdateProductRequest(),
        createTenantSession(['products.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks product deactivation when stock or open references exist', async () => {
    const { service, store } = createService();
    store.productById = createProductRecord();
    store.deactivationBlockers = ['non_zero_stock', 'open_job_orders'];

    await expect(
      service.deactivateProduct(
        PRODUCT_ID,
        createStatusChangeRequest(),
        createTenantSession(['products.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          code: 'product_deactivation_blocked_non_zero_stock',
        }),
        expect.objectContaining({
          code: 'product_deactivation_blocked_open_job_orders',
        }),
      ],
    });
  });

  it('reactivates an inactive product with products.update permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.productById = createProductRecord({ status: 'inactive' });
    store.changedProduct = createProductRecord({
      status: 'active',
      reactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.reactivateProduct(
      PRODUCT_ID,
      createStatusChangeRequest({ reason: 'Back in catalog.' }),
      createTenantSession(['products.update']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      fromStatus: 'inactive',
      toStatus: 'active',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.product).toMatchObject({
      status: 'active',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'products.reactivated',
        entityType: 'product',
        entityId: PRODUCT_ID,
        reason: 'Back in catalog.',
      }),
    );
  });
});

function createService(): {
  readonly service: ProductsService;
  readonly store: FakeProductStore;
  readonly auditService: AuditService;
} {
  const store = new FakeProductStore();
  const auditService = {
    record: vi.fn(
      async (input: unknown): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType:
          typeof input === 'object' && input !== null && 'actorType' in input
            ? (input.actorType as 'tenant_user')
            : 'tenant_user',
        supportAccessSessionId: null,
        action:
          typeof input === 'object' && input !== null && 'action' in input
            ? String(input.action)
            : 'test.audit',
        entityType:
          typeof input === 'object' && input !== null && 'entityType' in input
            ? String(input.entityType)
            : 'test',
        entityId: null,
        branchId: null,
        beforeJson: null,
        afterJson: null,
        metadataJson: null,
        reason: null,
        ipAddress: null,
        userAgent: null,
        retentionClass: 'standard_3_year',
        createdAt: NOW,
      }),
    ),
  } as unknown as AuditService;

  return {
    service: new ProductsService(store, new FakeTransactionRunner(), auditService),
    store,
    auditService,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantStatus?: TenantStatus;
  } = {},
): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: TENANT_ID,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: overrides.tenantStatus ?? 'active',
    },
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}

function createProductRequest(
  overrides: Partial<{
    name: string;
    sku: string;
    barcode: string;
    supplier_code: string;
    brand: string;
    category_id: string;
    unit_of_measure: string;
    default_cost: string;
    selling_price: string;
    reorder_level: string;
    description: string;
  }> = {},
) {
  return {
    name: overrides.name ?? 'Engine Oil 10W-40 1L',
    sku: overrides.sku ?? 'OIL-10W40-1L',
    barcode: overrides.barcode ?? '4800000000012',
    supplier_code: overrides.supplier_code ?? 'SUP-OIL-001',
    brand: overrides.brand ?? 'Motul',
    category_id: overrides.category_id ?? CATEGORY_ID,
    unit_of_measure: overrides.unit_of_measure ?? 'piece',
    default_cost: overrides.default_cost ?? '220.00',
    selling_price: overrides.selling_price ?? '320.00',
    reorder_level: overrides.reorder_level ?? '5.000',
    description: overrides.description ?? 'Synthetic oil.',
  };
}

function createUpdateProductRequest() {
  return {
    ...createProductRequest(),
    lock_version: 0,
  };
}

function createStatusChangeRequest(
  overrides: Partial<{
    lock_version: number;
    reason: string;
  }> = {},
) {
  return {
    lock_version: overrides.lock_version ?? 0,
    reason: overrides.reason,
  };
}

function createProductRecord(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: PRODUCT_ID,
    tenantId: TENANT_ID,
    categoryId: CATEGORY_ID,
    category: {
      id: CATEGORY_ID,
      name: 'Engine Oil',
      status: 'active',
    },
    name: 'Engine Oil 10W-40 1L',
    normalizedName: 'engine oil 10w-40 1l',
    sku: 'OIL-10W40-1L',
    normalizedSku: 'oil-10w40-1l',
    barcode: '4800000000012',
    normalizedBarcode: '4800000000012',
    supplierCode: 'SUP-OIL-001',
    brand: 'Motul',
    unitOfMeasure: 'piece',
    defaultCost: '220.00',
    sellingPrice: '320.00',
    reorderLevel: '5.000',
    description: 'Synthetic oil.',
    status: 'active',
    createdAt: NOW,
    createdByUserId: USER_ID,
    updatedAt: NOW,
    updatedByUserId: USER_ID,
    deactivatedAt: null,
    reactivatedAt: null,
    lockVersion: 0,
    ...overrides,
  };
}

class FakeTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({
      query: async <Row extends DatabaseRow = DatabaseRow>(): Promise<
        DatabaseQueryResult<Row>
      > => ({
        rows: [],
        rowCount: 0,
      }),
    });
  }
}

class FakeProductStore extends ProductStore {
  isOwner = false;
  products: readonly ProductRecord[] = [];
  productById: ProductRecord | null = createProductRecord();
  activeCategory: ProductCategorySnapshot | null = {
    id: CATEGORY_ID,
    name: 'Engine Oil',
    status: 'active',
  };
  updatedProduct: ProductRecord | null = createProductRecord({ lockVersion: 1 });
  changedProduct: ProductRecord | null = createProductRecord({ lockVersion: 1 });
  deactivationBlockers: readonly ProductDeactivationBlocker[] = [];

  readonly listInputs: ListProductsInput[] = [];
  readonly createdInputs: CreateProductInput[] = [];
  readonly updatedInputs: UpdateProductInput[] = [];
  readonly changedStatusInputs: ChangeProductStatusInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listProducts(input: ListProductsInput): Promise<readonly ProductRecord[]> {
    this.listInputs.push(input);

    return this.products;
  }

  async findProductById(): Promise<ProductRecord | null> {
    return this.productById;
  }

  async findActiveProductCategoryById(): Promise<ProductCategorySnapshot | null> {
    return this.activeCategory;
  }

  async createProduct(input: CreateProductInput): Promise<ProductRecord> {
    this.createdInputs.push(input);

    return createProductRecord({
      id: PRODUCT_ID,
      tenantId: input.tenantId,
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
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
    });
  }

  async updateProduct(input: UpdateProductInput): Promise<ProductRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedProduct;
  }

  async changeProductStatus(input: ChangeProductStatusInput): Promise<ProductRecord | null> {
    this.changedStatusInputs.push(input);

    return this.changedProduct;
  }

  async findProductDeactivationBlockers(): Promise<readonly ProductDeactivationBlocker[]> {
    return this.deactivationBlockers;
  }
}
