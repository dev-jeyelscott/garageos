import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import { AuditService, RecordAuditLogInput } from '../../../shared/audit/audit.service';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  CreateTenantLifecycleEventInput,
  PlatformSubscriptionSummary,
  PlatformTenantDetailRecord,
  PlatformTenantStore,
  UpdateTenantStatusInput,
} from './platform-tenant.store';
import { TenantLifecycleCommandService } from './tenant-lifecycle-command.service';
import { TenantLifecycleEvaluationService } from './tenant-lifecycle-evaluation.service';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-06-15T16:00:00.000Z');

describe('TenantLifecycleCommandService', () => {
  it('persists a system lifecycle status change transactionally', async () => {
    const { service, store, auditService } = createService();

    store.tenantById = createTenantRecord({
      status: 'active',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
    });

    const result = await service.evaluateAndPersistTenantLifecycle({
      tenantId: TENANT_ID,
      now: NOW,
    });

    expect(result.persisted).toBe(true);
    expect(result.tenant.status).toBe('read_only');
    expect(result.evaluation).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'active',
      computedLifecycleStatus: 'read_only',
      targetStatus: 'read_only',
      shouldUpdateTenantStatus: true,
      skippedReason: null,
    });

    const statusUpdate = getOnlyRecord(store.updatedTenantStatuses, 'tenant status update');

    expect(statusUpdate).toMatchObject({
      tenantId: TENANT_ID,
      status: 'read_only',
      updatedAt: NOW,
    });
    expect('deletionScheduledFor' in statusUpdate).toBe(false);

    const lifecycleEvent = getOnlyRecord(store.lifecycleEvents, 'tenant lifecycle event');

    expect(lifecycleEvent).toMatchObject({
      id: expect.any(String),
      tenantId: TENANT_ID,
      fromStatus: 'active',
      toStatus: 'read_only',
      source: 'system',
      reason: 'subscription_lifecycle_evaluation',
      effectiveAt: NOW,
      createdAt: NOW,
    });
    expect(lifecycleEvent.id).not.toBe('');

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: null,
        actorType: 'system',
        action: 'system.tenant_lifecycle.status_changed',
        entityType: 'tenant',
        entityId: TENANT_ID,
        beforeJson: {
          status: 'active',
        },
        afterJson: {
          status: 'read_only',
        },
        metadataJson: expect.objectContaining({
          computed_lifecycle_status: 'read_only',
          target_status: 'read_only',
          deletion_execution_eligible: false,
        }),
        reason: 'subscription_lifecycle_evaluation',
        createdAt: NOW,
        client: FAKE_DATABASE_CLIENT,
      }),
    );
  });

  it('sets deletion_scheduled_for when lifecycle moves a tenant into pending_deletion', async () => {
    const { service, store, auditService } = createService();
    const day68Timestamp = new Date('2026-08-07T16:00:00.000Z');

    store.tenantById = createTenantRecord({
      status: 'suspended',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
      deletionScheduledFor: null,
    });

    const result = await service.evaluateAndPersistTenantLifecycle({
      tenantId: TENANT_ID,
      now: day68Timestamp,
    });

    expect(result.persisted).toBe(true);
    expect(result.tenant.status).toBe('pending_deletion');
    expect(result.deletionScheduledFor).toEqual(day68Timestamp);
    expect(result.evaluation.deletionExecution).toEqual({
      eligible: true,
      reason: 'lifecycle_day_68_or_later',
      computedLifecycleStatus: 'deleted',
      currentStatus: 'suspended',
    });

    const statusUpdate = getOnlyRecord(store.updatedTenantStatuses, 'tenant status update');

    expect(statusUpdate).toMatchObject({
      tenantId: TENANT_ID,
      status: 'pending_deletion',
      updatedAt: day68Timestamp,
      deletionScheduledFor: day68Timestamp,
    });

    const lifecycleEvent = getOnlyRecord(store.lifecycleEvents, 'tenant lifecycle event');

    expect(lifecycleEvent).toMatchObject({
      tenantId: TENANT_ID,
      fromStatus: 'suspended',
      toStatus: 'pending_deletion',
      source: 'system',
      reason: 'subscription_lifecycle_evaluation',
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        action: 'system.tenant_lifecycle.status_changed',
        beforeJson: {
          status: 'suspended',
          deletion_scheduled_for: null,
        },
        afterJson: {
          status: 'pending_deletion',
          deletion_scheduled_for: day68Timestamp.toISOString(),
        },
        metadataJson: expect.objectContaining({
          computed_lifecycle_status: 'deleted',
          target_status: 'pending_deletion',
          deletion_execution_eligible: true,
          deletion_scheduled_for: day68Timestamp.toISOString(),
        }),
      }),
    );
  });

  it('does not persist anything when lifecycle evaluation is skipped', async () => {
    const { service, store, auditService } = createService();

    store.tenantById = createTenantRecord({
      status: 'read_only',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
    });

    const result = await service.evaluateAndPersistTenantLifecycle({
      tenantId: TENANT_ID,
      now: NOW,
    });

    expect(result).toMatchObject({
      persisted: false,
      lifecycleEventId: null,
    });
    expect(result.evaluation).toMatchObject({
      shouldUpdateTenantStatus: false,
      skippedReason: 'status_already_current',
    });

    expect(store.updatedTenantStatuses).toEqual([]);
    expect(store.lifecycleEvents).toEqual([]);
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('returns not_found when the tenant does not exist', async () => {
    const { service, store } = createService();

    store.tenantById = null;

    await expect(
      service.evaluateAndPersistTenantLifecycle({
        tenantId: TENANT_ID,
        now: NOW,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.updatedTenantStatuses).toEqual([]);
    expect(store.lifecycleEvents).toEqual([]);
  });
});

function createService(): {
  readonly service: TenantLifecycleCommandService;
  readonly store: FakePlatformTenantStore;
  readonly auditService: AuditService;
} {
  const store = createFakePlatformTenantStore();
  const auditService = {
    record: vi.fn(
      async (input: RecordAuditLogInput): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: input.tenantId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType,
        supportAccessSessionId: input.supportAccessSessionId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        branchId: input.branchId ?? null,
        beforeJson: input.beforeJson ?? null,
        afterJson: input.afterJson ?? null,
        metadataJson: input.metadataJson ?? null,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        retentionClass: input.retentionClass ?? 'standard_3_year',
        createdAt: input.createdAt ?? NOW,
      }),
    ),
  } as unknown as AuditService;

  return {
    service: new TenantLifecycleCommandService(
      store as unknown as PlatformTenantStore,
      new TenantLifecycleEvaluationService(),
      new FakeTransactionRunner(),
      auditService,
    ),
    store,
    auditService,
  };
}

function getOnlyRecord<T>(records: readonly T[], label: string): T {
  expect(records).toHaveLength(1);

  const record = records[0];

  if (record === undefined) {
    throw new Error(`Expected one ${label} record.`);
  }

  return record;
}

interface FakePlatformTenantStore {
  tenantById: PlatformTenantDetailRecord | null;
  readonly updatedTenantStatuses: UpdateTenantStatusInput[];
  readonly lifecycleEvents: CreateTenantLifecycleEventInput[];
  findTenantById(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord | null>;
  updateTenantStatus(
    input: UpdateTenantStatusInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord>;
  createTenantLifecycleEvent(
    input: CreateTenantLifecycleEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;
}

function createFakePlatformTenantStore(): FakePlatformTenantStore {
  return {
    tenantById: createTenantRecord(),
    updatedTenantStatuses: [],
    lifecycleEvents: [],

    async findTenantById(): Promise<PlatformTenantDetailRecord | null> {
      return this.tenantById;
    },

    async updateTenantStatus(input: UpdateTenantStatusInput): Promise<PlatformTenantDetailRecord> {
      this.updatedTenantStatuses.push(input);

      const currentTenant = this.tenantById ?? createTenantRecord();
      const shouldUpdateDeletionScheduledFor = Object.prototype.hasOwnProperty.call(
        input,
        'deletionScheduledFor',
      );

      this.tenantById = createTenantRecord({
        ...currentTenant,
        status: input.status,
        updatedAt: input.updatedAt,
        lockVersion: currentTenant.lockVersion + 1,
        deletionScheduledFor: shouldUpdateDeletionScheduledFor
          ? (input.deletionScheduledFor ?? null)
          : currentTenant.deletionScheduledFor,
      });

      return this.tenantById;
    },

    async createTenantLifecycleEvent(input: CreateTenantLifecycleEventInput): Promise<void> {
      this.lifecycleEvents.push(input);
    },
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

function createSubscriptionRecord(
  overrides: Partial<PlatformSubscriptionSummary> = {},
): PlatformSubscriptionSummary {
  return {
    planId: overrides.planId ?? PLAN_ID,
    startDate: overrides.startDate ?? '2026-05-01',
    expirationDate: overrides.expirationDate ?? '2026-06-01',
    statusSource: overrides.statusSource ?? 'system_computed',
    lastRenewalAt: overrides.lastRenewalAt ?? null,
    updatedByPlatformAdminUserId: overrides.updatedByPlatformAdminUserId ?? null,
    updatedAt: overrides.updatedAt ?? new Date('2026-05-01T00:00:00.000Z'),
  };
}

function createTenantRecord(
  overrides: Partial<PlatformTenantDetailRecord> = {},
): PlatformTenantDetailRecord {
  const createdAt = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z');

  return {
    id: overrides.id ?? TENANT_ID,
    businessName: overrides.businessName ?? 'GarageOS Test Shop',
    shopEmail: overrides.shopEmail ?? 'owner@example.com',
    status: overrides.status ?? 'active',
    timezone: overrides.timezone ?? 'Asia/Manila',
    country: overrides.country ?? 'PH',
    currency: overrides.currency ?? 'PHP',
    duplicateApprovedAt: overrides.duplicateApprovedAt ?? null,
    duplicateApprovedByPlatformAdminUserId:
      overrides.duplicateApprovedByPlatformAdminUserId ?? null,
    duplicateApprovalReason: overrides.duplicateApprovalReason ?? null,
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    lockVersion: overrides.lockVersion ?? 0,
    plan: overrides.plan ?? {
      id: PLAN_ID,
      code: 'basic',
      name: 'Basic',
      status: 'active',
    },
    subscription: overrides.subscription ?? createSubscriptionRecord(),
    owner: overrides.owner ?? null,
    ownerInvitation: overrides.ownerInvitation ?? null,
    onboardingCompletedAt: overrides.onboardingCompletedAt ?? new Date('2026-05-01T00:00:00.000Z'),
    deletionScheduledFor: overrides.deletionScheduledFor ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}
