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
  ExpenseCategoryStore,
  type ChangeExpenseCategoryStatusInput,
  type CreateExpenseCategoryInput,
  type ListExpenseCategoriesInput,
  type ExpenseCategoryDeactivationBlocker,
  type ExpenseCategoryRecord,
  type UpdateExpenseCategoryInput,
} from './expense-category.store';
import { ExpenseCategoriesService } from './expense-categories.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('ExpenseCategoriesService', () => {
  it('lists tenant-scoped active categories with expenses.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.categories = [createExpenseCategoryRecord()];

    const response = await service.listExpenseCategories(
      { q: 'oil', status: 'active', limit: 50 },
      createTenantSession(['expenses.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'oil',
      status: 'active',
      limit: 50,
    });
    expect(response.expense_categories).toHaveLength(1);
    expect(response.expense_categories[0]).toMatchObject({
      id: CATEGORY_ID,
      name: 'Engine Oil',
      status: 'active',
      lock_version: 0,
    });
  });

  it('requires expenses.read permission for detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.categoryById = createExpenseCategoryRecord();

    await expect(
      service.getExpenseCategory(CATEGORY_ID, createTenantSession([])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'expenses.read' }],
    });
  });

  it('uses session tenant scope for detail lookups', async () => {
    const { service, store } = createService();
    store.categoryById = null;

    await expect(
      service.getExpenseCategory(
        CATEGORY_ID,
        createTenantSession(['expenses.read'], { tenantId: OTHER_TENANT_ID }),
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
      service.createExpenseCategory(
        createCategoryRequest(),
        createTenantSession(['expense_categories.manage'], { tenantStatus: 'read_only' }),
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

      const response = await service.createExpenseCategory(
        createCategoryRequest({
          name: ' Engine   Oil ',
        }),
        createTenantSession(['expense_categories.manage']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        name: 'Engine Oil',
        normalizedName: 'engine oil',
        createdByUserId: USER_ID,
      });
      expect(response.expense_category).toMatchObject({
        id: CATEGORY_ID,
        name: 'Engine Oil',
        status: 'active',
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'expense_categories.created',
          entityType: 'expense_category',
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
      service.createExpenseCategory(
        createCategoryRequest(),
        createTenantSession(['expense_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('updates an active category with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createExpenseCategoryRecord();
    store.updatedCategory = createExpenseCategoryRecord({
      name: 'Premium Engine Oil',
      normalizedName: 'premium engine oil',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateExpenseCategory(
      CATEGORY_ID,
      createUpdateCategoryRequest({
        name: 'Premium Engine Oil',
      }),
      createTenantSession(['expense_categories.manage']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      expectedLockVersion: 0,
      name: 'Premium Engine Oil',
      normalizedName: 'premium engine oil',
    });
    expect(response.expense_category).toMatchObject({
      name: 'Premium Engine Oil',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expense_categories.updated',
        entityType: 'expense_category',
        entityId: CATEGORY_ID,
      }),
    );
  });

  it('blocks updates to inactive categories', async () => {
    const { service, store } = createService();
    store.categoryById = createExpenseCategoryRecord({ status: 'inactive' });

    await expect(
      service.updateExpenseCategory(
        CATEGORY_ID,
        createUpdateCategoryRequest(),
        createTenantSession(['expense_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'status',
          code: 'expense_category_not_active',
        }),
      ],
    });
  });

  it('returns version_conflict when category lock version is stale on update', async () => {
    const { service, store } = createService();
    store.categoryById = createExpenseCategoryRecord();
    store.updatedCategory = null;

    await expect(
      service.updateExpenseCategory(
        CATEGORY_ID,
        createUpdateCategoryRequest(),
        createTenantSession(['expense_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks category deactivation when active expenses are assigned', async () => {
    const { service, store } = createService();
    store.categoryById = createExpenseCategoryRecord();
    store.deactivationBlockers = ['active_expenses'];

    await expect(
      service.deactivateExpenseCategory(
        CATEGORY_ID,
        createStatusChangeRequest(),
        createTenantSession(['expense_categories.manage']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          code: 'expense_category_deactivation_blocked_active_expenses',
        }),
      ],
    });
  });

  it('deactivates an active category with expense_categories.manage permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createExpenseCategoryRecord();
    store.changedCategory = createExpenseCategoryRecord({
      status: 'inactive',
      deactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.deactivateExpenseCategory(
      CATEGORY_ID,
      createStatusChangeRequest({ reason: 'No longer used.' }),
      createTenantSession(['expense_categories.manage']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      fromStatus: 'active',
      toStatus: 'inactive',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.expense_category).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expense_categories.deactivated',
        entityType: 'expense_category',
        entityId: CATEGORY_ID,
        reason: 'No longer used.',
      }),
    );
  });

  it('reactivates an inactive category when active name remains unique', async () => {
    const { service, store, auditService } = createService();
    store.categoryById = createExpenseCategoryRecord({ status: 'inactive' });
    store.changedCategory = createExpenseCategoryRecord({
      status: 'active',
      reactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.reactivateExpenseCategory(
      CATEGORY_ID,
      createStatusChangeRequest({ reason: 'Category needed again.' }),
      createTenantSession(['expense_categories.manage']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      categoryId: CATEGORY_ID,
      fromStatus: 'inactive',
      toStatus: 'active',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.expense_category).toMatchObject({
      status: 'active',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expense_categories.reactivated',
        entityType: 'expense_category',
        entityId: CATEGORY_ID,
        reason: 'Category needed again.',
      }),
    );
  });

  it('returns version_conflict when category lock version is stale on status change', async () => {
    const { service, store } = createService();
    store.categoryById = createExpenseCategoryRecord();
    store.changedCategory = null;

    await expect(
      service.deactivateExpenseCategory(
        CATEGORY_ID,
        createStatusChangeRequest(),
        createTenantSession(['expense_categories.manage']),
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
  readonly service: ExpenseCategoriesService;
  readonly store: FakeExpenseCategoryStore;
  readonly auditService: AuditService;
} {
  const store = new FakeExpenseCategoryStore();
  const auditService = {
    record: vi.fn(async (input: unknown): Promise<AuditLogRecord> => ({
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
    })),
  } as unknown as AuditService;

  return {
    service: new ExpenseCategoriesService(store, new FakeTransactionRunner(), auditService),
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

function createExpenseCategoryRecord(
  overrides: Partial<ExpenseCategoryRecord> = {},
): ExpenseCategoryRecord {
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

class FakeExpenseCategoryStore extends ExpenseCategoryStore {
  isOwner = false;
  categories: ExpenseCategoryRecord[] = [];
  categoryById: ExpenseCategoryRecord | null = createExpenseCategoryRecord();
  createdCategory: ExpenseCategoryRecord | null = createExpenseCategoryRecord();
  updatedCategory: ExpenseCategoryRecord | null = createExpenseCategoryRecord({ lockVersion: 1 });
  changedCategory: ExpenseCategoryRecord | null = createExpenseCategoryRecord({ lockVersion: 1 });
  deactivationBlockers: ExpenseCategoryDeactivationBlocker[] = [];
  createThrowsDuplicateName = false;

  readonly listInputs: ListExpenseCategoriesInput[] = [];
  readonly findInputs: Array<{ tenantId: string; categoryId: string }> = [];
  readonly createdInputs: CreateExpenseCategoryInput[] = [];
  readonly updatedInputs: UpdateExpenseCategoryInput[] = [];
  readonly changedStatusInputs: ChangeExpenseCategoryStatusInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listExpenseCategories(
    input: ListExpenseCategoriesInput,
  ): Promise<readonly ExpenseCategoryRecord[]> {
    this.listInputs.push(input);

    return this.categories;
  }

  async findExpenseCategoryById(
    tenantId: string,
    categoryId: string,
  ): Promise<ExpenseCategoryRecord | null> {
    this.findInputs.push({ tenantId, categoryId });

    return this.categoryById;
  }

  async createExpenseCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategoryRecord> {
    this.createdInputs.push(input);

    if (this.createThrowsDuplicateName) {
      throw {
        code: '23505',
        constraint: 'ux_expense_categories_active_name',
      };
    }

    return (
      this.createdCategory ??
      createExpenseCategoryRecord({
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

  async updateExpenseCategory(
    input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategoryRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedCategory;
  }

  async changeExpenseCategoryStatus(
    input: ChangeExpenseCategoryStatusInput,
  ): Promise<ExpenseCategoryRecord | null> {
    this.changedStatusInputs.push(input);

    return this.changedCategory;
  }

  async findExpenseCategoryDeactivationBlockers(): Promise<
    readonly ExpenseCategoryDeactivationBlocker[]
  > {
    return this.deactivationBlockers;
  }
}
