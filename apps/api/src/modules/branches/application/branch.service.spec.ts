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
  type BranchSummaryRecord,
  type BranchDeactivationBlocker,
  type ChangeBranchStatusInput,
  type CreateBranchInput,
  type CreateBranchStatusEventInput,
  BranchStore,
  type UpdateBranchInput,
} from './branch.store';
import { BranchService } from './branch.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('BranchService', () => {
  it('lists tenant-scoped branches only with branches.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.branches = [createBranchRecord()];

    const response = await service.listBranches(createTenantSession(['branches.read']));

    expect(store.listTenantIds).toEqual([TENANT_ID]);
    expect(response.branches).toHaveLength(1);
    expect(response.branches[0]).toMatchObject({
      id: BRANCH_ID,
      name: 'Main Branch',
      status: 'active',
      lock_version: 0,
    });
  });

  it('requires branches.read permission for branch detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.branchById = createBranchRecord();

    await expect(service.getBranch(BRANCH_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'branches.read' }],
    });
  });

  it('uses session tenant scope when reading a branch detail', async () => {
    const { service, store } = createService();
    store.branchById = null;

    await expect(
      service.getBranch(
        BRANCH_ID,
        createTenantSession(['branches.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      branchId: BRANCH_ID,
    });
  });

  it('blocks branch updates for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.updateBranch(
        BRANCH_ID,
        createUpdateBranchRequest(),
        createTenantSession(['branches.update'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('updates a branch with optimistic locking and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      store.branchById = createBranchRecord();
      store.updatedBranch = createBranchRecord({
        name: 'Updated Branch',
        address: 'Updated Address',
        contactNumber: '+639991112222',
        lockVersion: 1,
        updatedAt: NOW,
      });

      const response = await service.updateBranch(
        BRANCH_ID,
        createUpdateBranchRequest({
          name: 'Updated Branch',
          address: 'Updated Address',
          contact_number: '+639991112222',
        }),
        createTenantSession(['branches.update']),
      );

      expect(store.updatedInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        expectedLockVersion: 0,
        normalizedName: 'updated branch',
      });
      expect(response).toMatchObject({
        name: 'Updated Branch',
        lock_version: 1,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'branches.updated',
          entityType: 'branch',
          entityId: BRANCH_ID,
          branchId: BRANCH_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns duplicate_resource for duplicate active branch names', async () => {
    const { service, store } = createService();
    store.branchById = createBranchRecord();
    store.updateError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'ux_branches_active_name',
    });

    await expect(
      service.updateBranch(
        BRANCH_ID,
        createUpdateBranchRequest(),
        createTenantSession(['branches.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('returns version_conflict when the mutable branch lock version is stale', async () => {
    const { service, store } = createService();
    store.branchById = createBranchRecord();
    store.updatedBranch = null;

    await expect(
      service.updateBranch(
        BRANCH_ID,
        createUpdateBranchRequest(),
        createTenantSession(['branches.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks branch create at the active-branch plan limit and audits the attempt', async () => {
    const { service, store, auditService } = createService();
    store.activeBranchCount = 1;
    store.maxActiveBranches = 1;

    await expect(
      service.createBranch(createCreateBranchRequest(), createTenantSession(['branches.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.PLAN_LIMIT_EXCEEDED,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branches.create.blocked_by_plan_limit',
        reason: 'plan_limit_exceeded',
      }),
    );
  });

  it('deactivates an active branch with status history and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.activeBranchCount = 2;
    store.branchById = createBranchRecord();
    store.changedBranch = createBranchRecord({
      status: 'inactive',
      lockVersion: 1,
      deactivatedAt: NOW,
    });

    const response = await service.deactivateBranch(
      BRANCH_ID,
      { lock_version: 0, reason: 'Closed this location.' },
      createTenantSession(['branches.deactivate']),
    );

    expect(response).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(store.statusEvents[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      fromStatus: 'active',
      toStatus: 'inactive',
      reason: 'Closed this location.',
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branches.deactivated',
        reason: 'Closed this location.',
      }),
    );
  });

  it('blocks deactivating the tenant last active branch', async () => {
    const { service, store } = createService();
    store.activeBranchCount = 1;
    store.branchById = createBranchRecord();

    await expect(
      service.deactivateBranch(
        BRANCH_ID,
        { lock_version: 0 },
        createTenantSession(['branches.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'last_active_branch' })],
    });
  });

  it('blocks branch deactivation when operational records still depend on the branch', async () => {
    const { service, store } = createService();
    store.activeBranchCount = 2;
    store.branchById = createBranchRecord();
    store.deactivationBlockers = ['open_job_orders', 'non_zero_stock'];

    await expect(
      service.deactivateBranch(
        BRANCH_ID,
        { lock_version: 0 },
        createTenantSession(['branches.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({ code: 'branch_deactivation_blocked_open_job_orders' }),
        expect.objectContaining({ code: 'branch_deactivation_blocked_non_zero_stock' }),
      ],
    });
  });

  it('reactivates an inactive branch only within the active-branch plan limit', async () => {
    const { service, store, auditService } = createService();
    store.activeBranchCount = 3;
    store.maxActiveBranches = 3;
    store.branchById = createBranchRecord({ status: 'inactive' });

    await expect(
      service.reactivateBranch(
        BRANCH_ID,
        { lock_version: 0 },
        createTenantSession(['branches.reactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.PLAN_LIMIT_EXCEEDED,
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branches.reactivate.blocked_by_plan_limit',
        branchId: BRANCH_ID,
      }),
    );
  });
});

function createService(): {
  readonly service: BranchService;
  readonly store: FakeBranchStore;
  readonly auditService: AuditService;
} {
  const store = new FakeBranchStore();
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
    service: new BranchService(store, new FakeTransactionRunner(), auditService),
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

function createCreateBranchRequest() {
  return {
    name: 'Main Branch',
    address: '123 Garage Street',
    contact_number: '+639171234567',
    business_hours: { mon: '09:00-18:00' },
  };
}

function createUpdateBranchRequest(
  overrides: Partial<ReturnType<typeof createCreateBranchRequest> & { lock_version: number }> = {},
) {
  return {
    ...createCreateBranchRequest(),
    lock_version: 0,
    ...overrides,
  };
}

function createBranchRecord(overrides: Partial<BranchSummaryRecord> = {}): BranchSummaryRecord {
  return {
    id: overrides.id ?? BRANCH_ID,
    name: overrides.name ?? 'Main Branch',
    address: overrides.address ?? '123 Garage Street',
    contactNumber: overrides.contactNumber ?? '+639171234567',
    businessHoursJson: overrides.businessHoursJson ?? { mon: '09:00-18:00' },
    status: overrides.status ?? 'active',
    lockVersion: overrides.lockVersion ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    deactivatedAt: overrides.deactivatedAt ?? null,
    reactivatedAt: overrides.reactivatedAt ?? null,
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

class FakeBranchStore extends BranchStore {
  isOwner = false;
  activeBranchCount = 0;
  maxActiveBranches = 10;
  branches: BranchSummaryRecord[] = [];
  branchById: BranchSummaryRecord | null = null;
  createdBranch: BranchSummaryRecord | null = createBranchRecord();
  updatedBranch: BranchSummaryRecord | null = createBranchRecord({ lockVersion: 1 });
  changedBranch: BranchSummaryRecord | null = createBranchRecord({ lockVersion: 1 });
  updateError: unknown = null;
  readonly listTenantIds: string[] = [];
  readonly findInputs: Array<{ tenantId: string; branchId: string }> = [];
  readonly createdInputs: CreateBranchInput[] = [];
  readonly updatedInputs: UpdateBranchInput[] = [];
  readonly changedInputs: ChangeBranchStatusInput[] = [];
  readonly statusEvents: CreateBranchStatusEventInput[] = [];
  deactivationBlockers: BranchDeactivationBlocker[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async countActiveBranches(): Promise<number> {
    return this.activeBranchCount;
  }

  async getEffectiveMaxActiveBranches(): Promise<number> {
    return this.maxActiveBranches;
  }

  async createBranch(input: CreateBranchInput): Promise<BranchSummaryRecord> {
    this.createdInputs.push(input);

    return this.createdBranch ?? createBranchRecord({ id: input.id, name: input.name });
  }

  async listBranches(tenantId: string): Promise<readonly BranchSummaryRecord[]> {
    this.listTenantIds.push(tenantId);

    return this.branches;
  }

  async findBranchById(tenantId: string, branchId: string): Promise<BranchSummaryRecord | null> {
    this.findInputs.push({ tenantId, branchId });

    return this.branchById;
  }

  async updateBranch(input: UpdateBranchInput): Promise<BranchSummaryRecord | null> {
    this.updatedInputs.push(input);

    if (this.updateError !== null) {
      throw this.updateError;
    }

    return this.updatedBranch;
  }

  async changeBranchStatus(input: ChangeBranchStatusInput): Promise<BranchSummaryRecord | null> {
    this.changedInputs.push(input);

    return this.changedBranch;
  }

  async createBranchStatusEvent(input: CreateBranchStatusEventInput): Promise<void> {
    this.statusEvents.push(input);
  }

  async findBranchDeactivationBlockers(): Promise<readonly BranchDeactivationBlocker[]> {
    return this.deactivationBlockers;
  }
}
