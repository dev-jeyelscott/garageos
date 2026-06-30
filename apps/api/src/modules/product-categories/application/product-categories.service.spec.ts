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
  ProductCategoryStore,
  type ChangeProductCategoryStatusInput,
  type CreateProductCategoryInput,
  type ListProductCategoriesInput,
  type ProductCategoryDeactivationBlocker,
  type ProductCategoryRecord,
  type UpdateProductCategoryInput,
} from './product-category.store';
import { ProductCategoriesService } from './product-categories.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('ProductCategoriesService', () => {
  it('lists tenant-scoped active categories with products.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.categories = [createProductCategoryRecord()];

    const response = await service.listProductCategories(
      { q: 'oil', status: 'active', limit: 50 },
      createTenantSession(['products.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'oil',
      status: 'active',
      limit: 50,
    });
    expect(response.product_categories).toHaveLength(1);
    expect(response.product_categories[0]).toMatchObject({
      id: CATEGORY_ID,
      name: 'Engine Oil',
      status: 'active',
      lock_version: 0,
    });
  });

  it('requires products.read permission for detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.categoryById = createProductCategoryRecord();

    await expect(
      service.getProductCategory(CATEGORY_ID, createTenantSession([])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'products.read' }],
    });
  });

  it('uses session tenant scope for detail lookups', async () => {
    const { service, store } = createService();
    store.categoryById = null;

    await expect(
      service.getProductCategory(
        CATEGORY_ID,
        createTenantSession(['products.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      categoryId: CATEGORY_ID,
    });
  });

  it('blocks category create for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createProductCategory(
        createCategoryRequest(),
        createTenantSession(['product_categories.manage'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('creates a category with normalized name and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createProductCategory(
        createCategoryRequest({
          name: ' Engine   Oil ',
        }),
        createTenantSession(['product_categories.manage']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        name: 'Engine Oil',
        normalizedName: 'engine oil',
        createdByUserId: USER_ID,
      });
      expect(response.product_category).toMatchObject({
        id: CATEGORY_ID,
        name: 'Engine Oil',
        status: 'active',
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product_categories.created',
          entityType: 'product_category',
          entityId: CATEGORY_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('translates duplicate active category name conflicts', async () => {
    const { service, store } = createService();
    store.createThrowsDuplicateName = true;

    await expect(
      service.createProductCategory(
        createCategoryRequest(),
        createTenantSession(['product_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('updates an active category with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createProductCategoryRecord();
    store.updatedCategory = createProductCategoryRecord({
      name: 'Premium Engine Oil',
      normalizedName: 'premium engine oil',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateProductCategory(
      CATEGORY_ID,
      createUpdateCategoryRequest({
        name: 'Premium Engine Oil',
      }),
      createTenantSession(['product_categories.manage']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      expectedLockVersion: 0,
      name: 'Premium Engine Oil',
      normalizedName: 'premium engine oil',
    });
    expect(response.product_category).toMatchObject({
      name: 'Premium Engine Oil',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_categories.updated',
        entityType: 'product_category',
        entityId: CATEGORY_ID,
      }),
    );
  });

  it('blocks updates to inactive categories', async () => {
    const { service, store } = createService();
    store.categoryById = createProductCategoryRecord({ status: 'inactive' });

    await expect(
      service.updateProductCategory(
        CATEGORY_ID,
        createUpdateCategoryRequest(),
        createTenantSession(['product_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'status',
          code: 'product_category_not_active',
        }),
      ],
    });
  });

  it('returns version_conflict when category lock version is stale on update', async () => {
    const { service, store } = createService();
    store.categoryById = createProductCategoryRecord();
    store.updatedCategory = null;

    await expect(
      service.updateProductCategory(
        CATEGORY_ID,
        createUpdateCategoryRequest(),
        createTenantSession(['product_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks category deactivation when active products are assigned', async () => {
    const { service, store } = createService();
    store.categoryById = createProductCategoryRecord();
    store.deactivationBlockers = ['active_products'];

    await expect(
      service.deactivateProductCategory(
        CATEGORY_ID,
        createStatusChangeRequest(),
        createTenantSession(['product_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          code: 'product_category_deactivation_blocked_active_products',
        }),
      ],
    });
  });

  it('deactivates an active category with product_categories.manage permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createProductCategoryRecord();
    store.changedCategory = createProductCategoryRecord({
      status: 'inactive',
      deactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.deactivateProductCategory(
      CATEGORY_ID,
      createStatusChangeRequest({ reason: 'No longer used.' }),
      createTenantSession(['product_categories.manage']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      fromStatus: 'active',
      toStatus: 'inactive',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.product_category).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_categories.deactivated',
        entityType: 'product_category',
        entityId: CATEGORY_ID,
        reason: 'No longer used.',
      }),
    );
  });

  it('reactivates an inactive category when active name remains unique', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createProductCategoryRecord({ status: 'inactive' });
    store.changedCategory = createProductCategoryRecord({
      status: 'active',
      reactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.reactivateProductCategory(
      CATEGORY_ID,
      createStatusChangeRequest({ reason: 'Category needed again.' }),
      createTenantSession(['product_categories.manage']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      fromStatus: 'inactive',
      toStatus: 'active',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.product_category).toMatchObject({
      status: 'active',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_categories.reactivated',
        entityType: 'product_category',
        entityId: CATEGORY_ID,
        reason: 'Category needed again.',
      }),
    );
  });

  it('returns version_conflict when category lock version is stale on status change', async () => {
    const { service, store } = createService();
    store.categoryById = createProductCategoryRecord();
    store.changedCategory = null;

    await expect(
      service.deactivateProductCategory(
        CATEGORY_ID,
        createStatusChangeRequest(),
        createTenantSession(['product_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });
});

type CategoryRequestTestOverrides = Partial<{
  name: string;
  lock_version: number;
}>;

function createService(): {
  readonly service: ProductCategoriesService;
  readonly store: FakeProductCategoryStore;
  readonly auditService: AuditService;
} {
  const store = new FakeProductCategoryStore();
  const auditService = {
    record: vi.fn(
      async (input: unknown): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
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
    service: new ProductCategoriesService(store, new FakeTransactionRunner(), auditService),
    store,
    auditService,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantId?: string;
    readonly tenantStatus?: TenantStatus;
  } = {},
): TenantContextAuthenticatedSession {
  const tenantId = overrides.tenantId ?? TENANT_ID;

  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: overrides.tenantStatus ?? 'active',
    },
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}

function createCategoryRequest(overrides: CategoryRequestTestOverrides = {}) {
  return {
    name: 'Engine Oil',
    ...overrides,
  };
}

function createUpdateCategoryRequest(overrides: CategoryRequestTestOverrides = {}) {
  return {
    name: 'Engine Oil',
    lock_version: 0,
    ...overrides,
  };
}

function createStatusChangeRequest(
  overrides: Partial<{
    lock_version: number;
    reason: string;
  }> = {},
) {
  return {
    lock_version: 0,
    ...overrides,
  };
}

function createProductCategoryRecord(
  overrides: Partial<ProductCategoryRecord> = {},
): ProductCategoryRecord {
  return {
    id: overrides.id ?? CATEGORY_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    name: overrides.name ?? 'Engine Oil',
    normalizedName: overrides.normalizedName ?? 'engine oil',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? NOW,
    createdByUserId: overrides.createdByUserId ?? USER_ID,
    updatedAt: overrides.updatedAt ?? NOW,
    updatedByUserId: overrides.updatedByUserId ?? USER_ID,
    deactivatedAt: overrides.deactivatedAt ?? null,
    reactivatedAt: overrides.reactivatedAt ?? null,
    lockVersion: overrides.lockVersion ?? 0,
  };
}

const FAKE_DATABASE_CLIENT: DatabaseQueryClient = {
  async query<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseQueryResult<Row>> {
    return {
      rows: [],
      rowCount: 0,
    };
  },
};

class FakeTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work(FAKE_DATABASE_CLIENT);
  }
}

class FakeProductCategoryStore extends ProductCategoryStore {
  isOwner = false;
  categories: ProductCategoryRecord[] = [];
  categoryById: ProductCategoryRecord | null = createProductCategoryRecord();
  createdCategory: ProductCategoryRecord | null = createProductCategoryRecord();
  updatedCategory: ProductCategoryRecord | null = createProductCategoryRecord({ lockVersion: 1 });
  changedCategory: ProductCategoryRecord | null = createProductCategoryRecord({ lockVersion: 1 });
  deactivationBlockers: ProductCategoryDeactivationBlocker[] = [];
  createThrowsDuplicateName = false;

  readonly listInputs: ListProductCategoriesInput[] = [];
  readonly findInputs: Array<{ tenantId: string; categoryId: string }> = [];
  readonly createdInputs: CreateProductCategoryInput[] = [];
  readonly updatedInputs: UpdateProductCategoryInput[] = [];
  readonly changedStatusInputs: ChangeProductCategoryStatusInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listProductCategories(
    input: ListProductCategoriesInput,
  ): Promise<readonly ProductCategoryRecord[]> {
    this.listInputs.push(input);

    return this.categories;
  }

  async findProductCategoryById(
    tenantId: string,
    categoryId: string,
  ): Promise<ProductCategoryRecord | null> {
    this.findInputs.push({ tenantId, categoryId });

    return this.categoryById;
  }

  async createProductCategory(input: CreateProductCategoryInput): Promise<ProductCategoryRecord> {
    this.createdInputs.push(input);

    if (this.createThrowsDuplicateName) {
      throw {
        code: '23505',
        constraint: 'ux_product_categories_active_name',
      };
    }

    return (
      this.createdCategory ??
      createProductCategoryRecord({
        id: input.id,
        tenantId: input.tenantId,
        name: input.name,
        normalizedName: input.normalizedName,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
    );
  }

  async updateProductCategory(
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategoryRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedCategory;
  }

  async changeProductCategoryStatus(
    input: ChangeProductCategoryStatusInput,
  ): Promise<ProductCategoryRecord | null> {
    this.changedStatusInputs.push(input);

    return this.changedCategory;
  }

  async findProductCategoryDeactivationBlockers(): Promise<
    readonly ProductCategoryDeactivationBlocker[]
  > {
    return this.deactivationBlockers;
  }
}
