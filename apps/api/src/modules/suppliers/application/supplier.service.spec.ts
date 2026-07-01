import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
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
import { SupplierService } from './supplier.service';
import {
  type ChangeSupplierStatusInput,
  type CreateSupplierInput,
  type ListSuppliersInput,
  SupplierStore,
  type SupplierDeactivationBlocker,
  type SupplierRecord,
  type UpdateSupplierInput,
} from './supplier.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-07-02T00:00:00.000Z');

const FAKE_DATABASE_CLIENT: DatabaseQueryClient = {
  async query<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseQueryResult<Row>> {
    return {
      rows: [],
      rowCount: 0,
    };
  },
};

class ImmediateTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work(FAKE_DATABASE_CLIENT);
  }
}

describe('SupplierService', () => {
  it('lists tenant-scoped suppliers with suppliers.read permission', async () => {
    const { service, store } = createService();
    store.suppliers = [createSupplierRecord()];

    const response = await service.listSuppliers(
      { q: ' ACME ', status: 'all', limit: 50 },
      createTenantSession(['suppliers.read'], { branchIds: [], tenantWideBranchAccess: false }),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'acme',
      status: 'all',
      limit: 51,
    });
    expect(response.suppliers).toHaveLength(1);
    expect(response.suppliers[0]).toMatchObject({
      id: SUPPLIER_ID,
      name: 'ACME Parts',
      status: 'active',
    });
  });

  it('requires suppliers.read permission for supplier detail', async () => {
    const { service, store } = createService();
    store.supplierById = createSupplierRecord();

    await expect(service.getSupplier(SUPPLIER_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'suppliers.read' }],
    });
  });

  it('uses session tenant scope when reading supplier detail', async () => {
    const { service, store } = createService();
    store.supplierById = null;

    await expect(
      service.getSupplier(
        SUPPLIER_ID,
        createTenantSession(['suppliers.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      supplierId: SUPPLIER_ID,
    });
  });

  it('creates a supplier with tenant scope, duplicate prevention, and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditRecords } = createService();

      const response = await service.createSupplier(
        createSupplierRequest(),
        createTenantSession(['suppliers.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        name: 'ACME Parts',
        normalizedName: 'acme parts',
        createdByUserId: USER_ID,
      });
      expect(response.supplier).toMatchObject({
        name: 'ACME Parts',
        status: 'active',
      });
      expect(auditRecords[0]).toMatchObject({
        action: 'suppliers.created',
        entityType: 'supplier',
        entityId: SUPPLIER_ID,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks supplier create when tenant lifecycle is read-only', async () => {
    const { service, store } = createService();

    await expect(
      service.createSupplier(
        createSupplierRequest(),
        createTenantSession(['suppliers.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });

    expect(store.createdInputs).toEqual([]);
  });

  it('returns duplicate_resource for duplicate active supplier names', async () => {
    const { service, store } = createService();
    store.createError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'ux_suppliers_active_name',
    });

    await expect(
      service.createSupplier(createSupplierRequest(), createTenantSession(['suppliers.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('updates a supplier with optimistic locking and audit logging', async () => {
    const { service, store, auditRecords } = createService();
    store.supplierById = createSupplierRecord();
    store.updatedSupplier = createSupplierRecord({
      name: 'Updated Supplier',
      normalizedName: 'updated supplier',
      lockVersion: 2,
      updatedAt: NOW,
    });

    const response = await service.updateSupplier(
      SUPPLIER_ID,
      { ...createSupplierRequest({ name: 'Updated Supplier' }), lock_version: 1 },
      createTenantSession(['suppliers.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      supplierId: SUPPLIER_ID,
      expectedLockVersion: 1,
      normalizedName: 'updated supplier',
    });
    expect(response.supplier).toMatchObject({
      name: 'Updated Supplier',
      lock_version: 2,
    });
    expect(auditRecords[0]).toMatchObject({
      action: 'suppliers.updated',
      entityType: 'supplier',
      entityId: SUPPLIER_ID,
    });
  });

  it('returns version_conflict when supplier update lock version is stale', async () => {
    const { service, store } = createService();
    store.supplierById = createSupplierRecord();
    store.updatedSupplier = null;

    await expect(
      service.updateSupplier(
        SUPPLIER_ID,
        { ...createSupplierRequest(), lock_version: 9 },
        createTenantSession(['suppliers.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('deactivates a supplier only when there are no open purchase orders or unpaid AP blockers', async () => {
    const { service, store } = createService();
    store.supplierById = createSupplierRecord();
    store.deactivationBlockers = ['open_purchase_orders', 'unpaid_accounts_payable'];

    await expect(
      service.deactivateSupplier(SUPPLIER_ID, {}, createTenantSession(['suppliers.deactivate'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({ code: 'supplier_deactivation_blocked_open_purchase_orders' }),
        expect.objectContaining({ code: 'supplier_deactivation_blocked_unpaid_accounts_payable' }),
      ],
    });

    expect(store.changedInputs).toEqual([]);
  });

  it('deactivates an active supplier with audit logging', async () => {
    const { service, store, auditRecords } = createService();
    store.supplierById = createSupplierRecord();
    store.changedSupplier = createSupplierRecord({
      status: 'inactive',
      lockVersion: 2,
      deactivatedAt: NOW,
    });

    const response = await service.deactivateSupplier(
      SUPPLIER_ID,
      { reason: 'No longer used.' },
      createTenantSession(['suppliers.deactivate']),
    );

    expect(store.changedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      supplierId: SUPPLIER_ID,
      fromStatus: 'active',
      toStatus: 'inactive',
      expectedLockVersion: null,
    });
    expect(response.supplier).toMatchObject({ status: 'inactive', lock_version: 2 });
    expect(auditRecords[0]).toMatchObject({
      action: 'suppliers.deactivated',
      reason: 'No longer used.',
    });
  });

  it('requires suppliers.update permission for supplier reactivation', async () => {
    const { service, store } = createService();
    store.supplierById = createSupplierRecord({ status: 'inactive' });

    await expect(
      service.reactivateSupplier(SUPPLIER_ID, {}, createTenantSession([])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'suppliers.update' }],
    });
  });

  it('reactivates an inactive supplier and re-checks active-name uniqueness', async () => {
    const { service, store, auditRecords } = createService();
    store.supplierById = createSupplierRecord({ status: 'inactive' });
    store.changedSupplier = createSupplierRecord({
      status: 'active',
      lockVersion: 3,
      reactivatedAt: NOW,
    });

    const response = await service.reactivateSupplier(
      SUPPLIER_ID,
      { lock_version: 2 },
      createTenantSession(['suppliers.update']),
    );

    expect(store.changedInputs[0]).toMatchObject({
      fromStatus: 'inactive',
      toStatus: 'active',
      expectedLockVersion: 2,
    });
    expect(response.supplier).toMatchObject({ status: 'active', lock_version: 3 });
    expect(auditRecords[0]).toMatchObject({
      action: 'suppliers.reactivated',
      entityType: 'supplier',
    });
  });

  it('returns duplicate_resource when reactivation conflicts with an active supplier name', async () => {
    const { service, store } = createService();
    store.supplierById = createSupplierRecord({ status: 'inactive' });
    store.changeError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'ux_suppliers_active_name',
    });

    await expect(
      service.reactivateSupplier(SUPPLIER_ID, {}, createTenantSession(['suppliers.update'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });
});

function createService(): {
  readonly service: SupplierService;
  readonly store: FakeSupplierStore;
  readonly auditRecords: unknown[];
} {
  const store = new FakeSupplierStore();
  const auditRecords: unknown[] = [];
  const auditService = {
    record: vi.fn(async (input: unknown): Promise<unknown> => {
      auditRecords.push(input);

      return input;
    }),
  } as unknown as AuditService;

  return {
    service: new SupplierService(store, new ImmediateTransactionRunner(), auditService),
    store,
    auditRecords,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantId?: string;
    readonly tenantStatus?: TenantStatus;
    readonly branchIds?: readonly string[];
    readonly tenantWideBranchAccess?: boolean;
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
    branches: (overrides.branchIds ?? []).map((id) => ({ id })),
    tenant_wide_branch_access: overrides.tenantWideBranchAccess ?? true,
    subscription_status_source: 'system_computed',
  };
}

function createSupplierRequest(
  overrides: Partial<ReturnType<typeof createSupplierRequestBase>> = {},
) {
  return {
    ...createSupplierRequestBase(),
    ...overrides,
  };
}

function createSupplierRequestBase() {
  return {
    name: 'ACME Parts',
    contact_person: 'Maria Santos',
    mobile_number: '+639171234567',
    email: 'parts@example.com',
    address: '123 Supplier Avenue',
    notes: 'Primary supplier',
  };
}

function createSupplierRecord(overrides: Partial<SupplierRecord> = {}): SupplierRecord {
  return {
    id: overrides.id ?? SUPPLIER_ID,
    name: overrides.name ?? 'ACME Parts',
    normalizedName: overrides.normalizedName ?? 'acme parts',
    contactPerson: overrides.contactPerson ?? 'Maria Santos',
    mobileNumber: overrides.mobileNumber ?? '+639171234567',
    email: overrides.email ?? 'parts@example.com',
    address: overrides.address ?? '123 Supplier Avenue',
    notes: overrides.notes ?? 'Primary supplier',
    status: overrides.status ?? 'active',
    lockVersion: overrides.lockVersion ?? 1,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    deactivatedAt: overrides.deactivatedAt ?? null,
    reactivatedAt: overrides.reactivatedAt ?? null,
  };
}

class FakeSupplierStore extends SupplierStore {
  suppliers: SupplierRecord[] = [];
  supplierById: SupplierRecord | null = createSupplierRecord();
  createdSupplier: SupplierRecord | null = createSupplierRecord();
  updatedSupplier: SupplierRecord | null = createSupplierRecord({ lockVersion: 2 });
  changedSupplier: SupplierRecord | null = createSupplierRecord({ lockVersion: 2 });
  deactivationBlockers: SupplierDeactivationBlocker[] = [];
  createError: unknown = null;
  updateError: unknown = null;
  changeError: unknown = null;
  readonly listInputs: ListSuppliersInput[] = [];
  readonly findInputs: Array<{ tenantId: string; supplierId: string }> = [];
  readonly createdInputs: CreateSupplierInput[] = [];
  readonly updatedInputs: UpdateSupplierInput[] = [];
  readonly changedInputs: ChangeSupplierStatusInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async listSuppliers(input: ListSuppliersInput): Promise<readonly SupplierRecord[]> {
    this.listInputs.push(input);

    return this.suppliers;
  }

  async findSupplierById(tenantId: string, supplierId: string): Promise<SupplierRecord | null> {
    this.findInputs.push({ tenantId, supplierId });

    return this.supplierById;
  }

  async createSupplier(input: CreateSupplierInput): Promise<SupplierRecord> {
    this.createdInputs.push(input);

    if (this.createError !== null) {
      throw this.createError;
    }

    return this.createdSupplier ?? createSupplierRecord({ id: input.id, name: input.name });
  }

  async updateSupplier(input: UpdateSupplierInput): Promise<SupplierRecord | null> {
    this.updatedInputs.push(input);

    if (this.updateError !== null) {
      throw this.updateError;
    }

    return this.updatedSupplier;
  }

  async changeSupplierStatus(input: ChangeSupplierStatusInput): Promise<SupplierRecord | null> {
    this.changedInputs.push(input);

    if (this.changeError !== null) {
      throw this.changeError;
    }

    return this.changedSupplier;
  }

  async findSupplierDeactivationBlockers(): Promise<readonly SupplierDeactivationBlocker[]> {
    return this.deactivationBlockers;
  }
}
