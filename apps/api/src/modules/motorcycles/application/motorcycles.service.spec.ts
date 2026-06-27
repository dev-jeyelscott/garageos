import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import type { AuditService } from '../../../shared/audit/audit.service';
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
  MotorcycleStore,
  type ActiveCustomerRecord,
  type CreateMotorcycleInput,
  type CreateMotorcycleMileageEventInput,
  type FindMotorcycleDuplicateWarningsInput,
  type FindMotorcycleIdentifierConflictsInput,
  type ListMotorcyclesInput,
  type MotorcycleDuplicateWarningRecord,
  type MotorcycleIdentifierConflictRecord,
  type MotorcycleRecord,
  type UpdateMotorcycleInput,
} from './motorcycle.store';
import { MotorcyclesService } from './motorcycles.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const MOTORCYCLE_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('MotorcyclesService', () => {
  it('lists tenant-scoped active motorcycles with motorcycles.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.motorcycles = [createMotorcycleRecord()];

    const response = await service.listMotorcycles(
      { q: 'abc 123', limit: 50 },
      createTenantSession(['motorcycles.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'abc 123',
      normalizedIdentifierSearch: 'ABC123',
      limit: 50,
    });
    expect(response.motorcycles).toHaveLength(1);
    expect(response.motorcycles[0]).toMatchObject({
      id: MOTORCYCLE_ID,
      customer_id: CUSTOMER_ID,
      brand: 'Honda',
      model: 'Click 125i',
      plate_number: 'ABC 123',
      mileage: 12000,
      status: 'active',
      lock_version: 0,
    });
  });

  it('requires motorcycles.read permission for detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.motorcycleById = createMotorcycleRecord();

    await expect(
      service.getMotorcycle(MOTORCYCLE_ID, createTenantSession([])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'motorcycles.read' }],
    });
  });

  it('uses session tenant scope for detail lookups', async () => {
    const { service, store } = createService();
    store.motorcycleById = null;

    await expect(
      service.getMotorcycle(
        MOTORCYCLE_ID,
        createTenantSession(['motorcycles.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      motorcycleId: MOTORCYCLE_ID,
    });
  });

  it('blocks motorcycle create for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createMotorcycle(
        createMotorcycleRequest(),
        createTenantSession(['motorcycles.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('creates a motorcycle with active customer, duplicate warnings, mileage event, and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      store.duplicateWarnings = [
        {
          type: 'similar_model',
          motorcycleId: '66666666-6666-4666-8666-666666666666',
          brand: 'Honda',
          model: 'Click 125',
          plateNumber: 'ABC 124',
          engineNumber: null,
          chassisNumber: null,
        },
      ];

      const response = await service.createMotorcycle(
        createMotorcycleRequest({
          plate_number: 'abc 123',
          engine_number: ' eng-001 ',
          chassis_number: ' chs-001 ',
        }),
        createTenantSession(['motorcycles.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        brand: 'Honda',
        model: 'Click 125i',
        plateNumber: 'ABC 123',
        normalizedPlateNumber: 'ABC123',
        engineNumber: 'ENG-001',
        normalizedEngineNumber: 'ENG001',
        chassisNumber: 'CHS-001',
        normalizedChassisNumber: 'CHS001',
        latestMileage: 12000,
      });
      expect(store.mileageEvents[0]).toMatchObject({
        tenantId: TENANT_ID,
        motorcycleId: MOTORCYCLE_ID,
        sourceType: 'manual_create',
        previousMileage: null,
        newMileage: 12000,
        reason: 'motorcycle_created',
      });
      expect(response.duplicate_warnings).toHaveLength(1);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'motorcycles.created',
          entityType: 'motorcycle',
          entityId: MOTORCYCLE_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks motorcycle create when customer is not active in the tenant', async () => {
    const { service, store } = createService();
    store.activeCustomer = null;

    await expect(
      service.createMotorcycle(
        createMotorcycleRequest(),
        createTenantSession(['motorcycles.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'customer_id',
          code: 'customer_not_active',
        }),
      ],
    });
  });

  it('blocks exact active duplicate identifiers in the same tenant', async () => {
    const { service, store } = createService();
    store.identifierConflicts = [
      {
        type: 'plate_number',
        motorcycleId: '66666666-6666-4666-8666-666666666666',
        brand: 'Honda',
        model: 'Click 125',
        plateNumber: 'ABC 123',
        engineNumber: null,
        chassisNumber: null,
      },
    ];

    await expect(
      service.createMotorcycle(
        createMotorcycleRequest(),
        createTenantSession(['motorcycles.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('updates a motorcycle with optimistic locking, mileage event, and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.motorcycleById = createMotorcycleRecord();
    store.updatedMotorcycle = createMotorcycleRecord({
      model: 'Click 160',
      latestMileage: 12500,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateMotorcycle(
      MOTORCYCLE_ID,
      createUpdateMotorcycleRequest({ model: 'Click 160', mileage: 12500 }),
      createTenantSession(['motorcycles.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      motorcycleId: MOTORCYCLE_ID,
      expectedLockVersion: 0,
      model: 'Click 160',
      latestMileage: 12500,
    });
    expect(store.mileageEvents[0]).toMatchObject({
      previousMileage: 12000,
      newMileage: 12500,
      reason: 'motorcycle_updated',
    });
    expect(response.motorcycle).toMatchObject({
      model: 'Click 160',
      mileage: 12500,
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'motorcycles.updated',
        entityType: 'motorcycle',
        entityId: MOTORCYCLE_ID,
      }),
    );
  });

  it('requires correction reason when mileage is lowered', async () => {
    const { service, store } = createService();
    store.motorcycleById = createMotorcycleRecord({ latestMileage: 12000 });

    await expect(
      service.updateMotorcycle(
        MOTORCYCLE_ID,
        createUpdateMotorcycleRequest({ mileage: 11000 }),
        createTenantSession(['motorcycles.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'mileage_correction_reason',
          code: 'required_for_lower_mileage',
        }),
      ],
    });
  });

  it('returns version_conflict when motorcycle lock version is stale', async () => {
    const { service, store } = createService();
    store.motorcycleById = createMotorcycleRecord();
    store.updatedMotorcycle = null;

    await expect(
      service.updateMotorcycle(
        MOTORCYCLE_ID,
        createUpdateMotorcycleRequest(),
        createTenantSession(['motorcycles.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });
});

function createService(): {
  readonly service: MotorcyclesService;
  readonly store: FakeMotorcycleStore;
  readonly auditService: AuditService;
} {
  const store = new FakeMotorcycleStore();
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
    service: new MotorcyclesService(store, new FakeTransactionRunner(), auditService),
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

function createMotorcycleRequest(
  overrides: Partial<ReturnType<typeof baseMotorcycleRequest>> = {},
) {
  return {
    ...baseMotorcycleRequest(),
    ...overrides,
  };
}

function createUpdateMotorcycleRequest(
  overrides: Partial<
    ReturnType<typeof baseMotorcycleRequest> & {
      lock_version: number;
      mileage_correction_reason: string;
    }
  > = {},
) {
  return {
    ...baseMotorcycleRequest(),
    lock_version: 0,
    ...overrides,
  };
}

function baseMotorcycleRequest() {
  return {
    customer_id: CUSTOMER_ID,
    brand: 'Honda',
    model: 'Click 125i',
    year: 2024,
    color: 'Red',
    plate_number: 'ABC 123',
    engine_number: 'ENG-001',
    chassis_number: 'CHS-001',
    mileage: 12000,
  };
}

function createMotorcycleRecord(overrides: Partial<MotorcycleRecord> = {}): MotorcycleRecord {
  return {
    id: overrides.id ?? MOTORCYCLE_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    customerId: overrides.customerId ?? CUSTOMER_ID,
    brand: overrides.brand ?? 'Honda',
    model: overrides.model ?? 'Click 125i',
    year: overrides.year ?? 2024,
    color: overrides.color ?? 'Red',
    plateNumber: overrides.plateNumber ?? 'ABC 123',
    normalizedPlateNumber: overrides.normalizedPlateNumber ?? 'ABC123',
    engineNumber: overrides.engineNumber ?? 'ENG-001',
    normalizedEngineNumber: overrides.normalizedEngineNumber ?? 'ENG001',
    chassisNumber: overrides.chassisNumber ?? 'CHS-001',
    normalizedChassisNumber: overrides.normalizedChassisNumber ?? 'CHS001',
    latestMileage: overrides.latestMileage ?? 12000,
    status: overrides.status ?? 'active',
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
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

class FakeMotorcycleStore extends MotorcycleStore {
  isOwner = false;
  activeCustomer: ActiveCustomerRecord | null = {
    id: CUSTOMER_ID,
    name: 'Pedro Santos',
  };
  motorcycles: MotorcycleRecord[] = [];
  motorcycleById: MotorcycleRecord | null = createMotorcycleRecord();
  createdMotorcycle: MotorcycleRecord | null = createMotorcycleRecord();
  updatedMotorcycle: MotorcycleRecord | null = createMotorcycleRecord({ lockVersion: 1 });
  identifierConflicts: MotorcycleIdentifierConflictRecord[] = [];
  duplicateWarnings: MotorcycleDuplicateWarningRecord[] = [];

  readonly listInputs: ListMotorcyclesInput[] = [];
  readonly findInputs: Array<{ tenantId: string; motorcycleId: string }> = [];
  readonly customerFindInputs: Array<{ tenantId: string; customerId: string }> = [];
  readonly createdInputs: CreateMotorcycleInput[] = [];
  readonly updatedInputs: UpdateMotorcycleInput[] = [];
  readonly mileageEvents: CreateMotorcycleMileageEventInput[] = [];
  readonly identifierConflictInputs: FindMotorcycleIdentifierConflictsInput[] = [];
  readonly duplicateWarningInputs: FindMotorcycleDuplicateWarningsInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async findActiveCustomerById(
    tenantId: string,
    customerId: string,
  ): Promise<ActiveCustomerRecord | null> {
    this.customerFindInputs.push({ tenantId, customerId });

    return this.activeCustomer;
  }

  async listMotorcycles(input: ListMotorcyclesInput): Promise<readonly MotorcycleRecord[]> {
    this.listInputs.push(input);

    return this.motorcycles;
  }

  async findMotorcycleById(
    tenantId: string,
    motorcycleId: string,
  ): Promise<MotorcycleRecord | null> {
    this.findInputs.push({ tenantId, motorcycleId });

    return this.motorcycleById;
  }

  async createMotorcycle(input: CreateMotorcycleInput): Promise<MotorcycleRecord> {
    this.createdInputs.push(input);

    return (
      this.createdMotorcycle ??
      createMotorcycleRecord({
        id: input.id,
        customerId: input.customerId,
        brand: input.brand,
        model: input.model,
        latestMileage: input.latestMileage,
      })
    );
  }

  async updateMotorcycle(input: UpdateMotorcycleInput): Promise<MotorcycleRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedMotorcycle;
  }

  async createMotorcycleMileageEvent(input: CreateMotorcycleMileageEventInput): Promise<void> {
    this.mileageEvents.push(input);
  }

  async findIdentifierConflicts(
    input: FindMotorcycleIdentifierConflictsInput,
  ): Promise<readonly MotorcycleIdentifierConflictRecord[]> {
    this.identifierConflictInputs.push(input);

    return this.identifierConflicts;
  }

  async findDuplicateWarnings(
    input: FindMotorcycleDuplicateWarningsInput,
  ): Promise<readonly MotorcycleDuplicateWarningRecord[]> {
    this.duplicateWarningInputs.push(input);

    return this.duplicateWarnings;
  }
}
