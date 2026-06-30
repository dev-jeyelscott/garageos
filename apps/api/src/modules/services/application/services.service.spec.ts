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
  ServiceStore,
  type ChangeServiceStatusInput,
  type CreateServiceInput,
  type ListServicesInput,
  type ServiceDeactivationBlocker,
  type ServiceRecord,
  type UpdateServiceInput,
} from './service.store';
import { ServicesService } from './services.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('ServicesService', () => {
  it('lists tenant-scoped active services with services.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.services = [createServiceRecord()];

    const response = await service.listServices(
      { q: 'oil change', status: 'active', limit: 50 },
      createTenantSession(['services.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      normalizedSearch: 'oil change',
      status: 'active',
      limit: 50,
    });
    expect(response.services).toHaveLength(1);
    expect(response.services[0]).toMatchObject({
      id: SERVICE_ID,
      name: 'Oil Change',
      starting_price: '350.00',
      variable_price: false,
      status: 'active',
      lock_version: 0,
    });
  });

  it('requires services.read permission for detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.serviceById = createServiceRecord();

    await expect(service.getService(SERVICE_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'services.read' }],
    });
  });

  it('uses session tenant scope for detail lookups', async () => {
    const { service, store } = createService();
    store.serviceById = null;

    await expect(
      service.getService(
        SERVICE_ID,
        createTenantSession(['services.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      serviceId: SERVICE_ID,
    });
  });

  it('blocks service create for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createService(
        createServiceRequest(),
        createTenantSession(['services.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('creates a service with normalized name and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createService(
        createServiceRequest({
          name: ' Oil   Change ',
          description: '  Basic engine oil replacement  ',
        }),
        createTenantSession(['services.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        name: 'Oil Change',
        normalizedName: 'oil change',
        startingPrice: '350.00',
        variablePrice: false,
        priceDisclaimer: null,
        description: 'Basic engine oil replacement',
        createdByUserId: USER_ID,
      });
      expect(response.service).toMatchObject({
        id: SERVICE_ID,
        name: 'Oil Change',
        starting_price: '350.00',
        variable_price: false,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'services.created',
          entityType: 'service',
          entityId: SERVICE_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('translates duplicate active service name conflicts', async () => {
    const { service, store } = createService();
    store.createThrowsDuplicateName = true;

    await expect(
      service.createService(createServiceRequest(), createTenantSession(['services.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('updates an active service with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.serviceById = createServiceRecord();
    store.updatedService = createServiceRecord({
      name: 'Premium Oil Change',
      normalizedName: 'premium oil change',
      startingPrice: '500.00',
      variablePrice: true,
      priceDisclaimer: 'Final price depends on oil grade.',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateService(
      SERVICE_ID,
      createUpdateServiceRequest({
        name: 'Premium Oil Change',
        starting_price: '500.00',
        variable_price: true,
        price_disclaimer: 'Final price depends on oil grade.',
      }),
      createTenantSession(['services.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      expectedLockVersion: 0,
      name: 'Premium Oil Change',
      normalizedName: 'premium oil change',
      startingPrice: '500.00',
      variablePrice: true,
      priceDisclaimer: 'Final price depends on oil grade.',
    });
    expect(response.service).toMatchObject({
      name: 'Premium Oil Change',
      starting_price: '500.00',
      variable_price: true,
      price_disclaimer: 'Final price depends on oil grade.',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'services.updated',
        entityType: 'service',
        entityId: SERVICE_ID,
      }),
    );
  });

  it('blocks updates to inactive services', async () => {
    const { service, store } = createService();
    store.serviceById = createServiceRecord({ status: 'inactive' });

    await expect(
      service.updateService(
        SERVICE_ID,
        createUpdateServiceRequest(),
        createTenantSession(['services.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'status',
          code: 'service_not_active',
        }),
      ],
    });
  });

  it('returns version_conflict when service lock version is stale on update', async () => {
    const { service, store } = createService();
    store.serviceById = createServiceRecord();
    store.updatedService = null;

    await expect(
      service.updateService(
        SERVICE_ID,
        createUpdateServiceRequest(),
        createTenantSession(['services.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks service deactivation when referenced by open workflows', async () => {
    const { service, store } = createService();
    store.serviceById = createServiceRecord();
    store.deactivationBlockers = ['open_job_orders', 'active_estimates'];

    await expect(
      service.deactivateService(
        SERVICE_ID,
        createStatusChangeRequest(),
        createTenantSession(['services.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          code: 'service_deactivation_blocked_open_job_orders',
        }),
        expect.objectContaining({
          code: 'service_deactivation_blocked_active_estimates',
        }),
      ],
    });
  });

  it('deactivates an active service with services.deactivate permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.serviceById = createServiceRecord();
    store.changedService = createServiceRecord({
      status: 'inactive',
      deactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.deactivateService(
      SERVICE_ID,
      createStatusChangeRequest({ reason: 'No longer offered.' }),
      createTenantSession(['services.deactivate']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      fromStatus: 'active',
      toStatus: 'inactive',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.service).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'services.deactivated',
        entityType: 'service',
        entityId: SERVICE_ID,
        reason: 'No longer offered.',
      }),
    );
  });

  it('reactivates an inactive service with services.update permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.serviceById = createServiceRecord({ status: 'inactive' });
    store.changedService = createServiceRecord({
      status: 'active',
      reactivatedAt: NOW,
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.reactivateService(
      SERVICE_ID,
      createStatusChangeRequest({ reason: 'Service offered again.' }),
      createTenantSession(['services.update']),
    );

    expect(store.changedStatusInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      fromStatus: 'inactive',
      toStatus: 'active',
      expectedLockVersion: 0,
      changedByUserId: USER_ID,
    });
    expect(response.service).toMatchObject({
      status: 'active',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'services.reactivated',
        entityType: 'service',
        entityId: SERVICE_ID,
        reason: 'Service offered again.',
      }),
    );
  });

  it('returns version_conflict when service lock version is stale on status change', async () => {
    const { service, store } = createService();
    store.serviceById = createServiceRecord();
    store.changedService = null;

    await expect(
      service.deactivateService(
        SERVICE_ID,
        createStatusChangeRequest(),
        createTenantSession(['services.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });
});

type ServiceRequestTestOverrides = Partial<{
  name: string;
  starting_price: string;
  variable_price: boolean;
  price_disclaimer: string;
  description: string;
  lock_version: number;
}>;

function createService(): {
  readonly service: ServicesService;
  readonly store: FakeServiceStore;
  readonly auditService: AuditService;
} {
  const store = new FakeServiceStore();
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
    service: new ServicesService(store, new FakeTransactionRunner(), auditService),
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

function createServiceRequest(overrides: ServiceRequestTestOverrides = {}) {
  return {
    ...baseServiceRequest(),
    ...overrides,
  };
}

function createUpdateServiceRequest(overrides: ServiceRequestTestOverrides = {}) {
  return {
    ...baseServiceRequest(),
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

function baseServiceRequest() {
  return {
    name: 'Oil Change',
    starting_price: '350.00',
    variable_price: false,
    description: 'Basic oil change service',
  };
}

function createServiceRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: overrides.id ?? SERVICE_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    name: overrides.name ?? 'Oil Change',
    normalizedName: overrides.normalizedName ?? 'oil change',
    startingPrice: overrides.startingPrice ?? '350.00',
    variablePrice: overrides.variablePrice ?? false,
    priceDisclaimer: overrides.priceDisclaimer ?? null,
    description: overrides.description ?? 'Basic oil change service',
    status: overrides.status ?? 'active',
    deactivatedAt: overrides.deactivatedAt ?? null,
    reactivatedAt: overrides.reactivatedAt ?? null,
    createdAt: overrides.createdAt ?? NOW,
    createdByUserId: overrides.createdByUserId ?? USER_ID,
    updatedAt: overrides.updatedAt ?? NOW,
    updatedByUserId: overrides.updatedByUserId ?? USER_ID,
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

class FakeServiceStore extends ServiceStore {
  isOwner = false;
  services: ServiceRecord[] = [];
  serviceById: ServiceRecord | null = createServiceRecord();
  createdService: ServiceRecord | null = createServiceRecord();
  updatedService: ServiceRecord | null = createServiceRecord({ lockVersion: 1 });
  changedService: ServiceRecord | null = createServiceRecord({ lockVersion: 1 });
  deactivationBlockers: ServiceDeactivationBlocker[] = [];
  createThrowsDuplicateName = false;

  readonly listInputs: ListServicesInput[] = [];
  readonly findInputs: Array<{ tenantId: string; serviceId: string }> = [];
  readonly createdInputs: CreateServiceInput[] = [];
  readonly updatedInputs: UpdateServiceInput[] = [];
  readonly changedStatusInputs: ChangeServiceStatusInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listServices(input: ListServicesInput): Promise<readonly ServiceRecord[]> {
    this.listInputs.push(input);

    return this.services;
  }

  async findServiceById(tenantId: string, serviceId: string): Promise<ServiceRecord | null> {
    this.findInputs.push({ tenantId, serviceId });

    return this.serviceById;
  }

  async createService(input: CreateServiceInput): Promise<ServiceRecord> {
    this.createdInputs.push(input);

    if (this.createThrowsDuplicateName) {
      throw {
        code: '23505',
        constraint: 'ux_services_active_name',
      };
    }

    return (
      this.createdService ??
      createServiceRecord({
        id: input.id,
        tenantId: input.tenantId,
        name: input.name,
        normalizedName: input.normalizedName,
        startingPrice: input.startingPrice,
        variablePrice: input.variablePrice,
        priceDisclaimer: input.priceDisclaimer,
        description: input.description,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
    );
  }

  async updateService(input: UpdateServiceInput): Promise<ServiceRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedService;
  }

  async changeServiceStatus(input: ChangeServiceStatusInput): Promise<ServiceRecord | null> {
    this.changedStatusInputs.push(input);

    return this.changedService;
  }

  async findServiceDeactivationBlockers(): Promise<readonly ServiceDeactivationBlocker[]> {
    return this.deactivationBlockers;
  }
}
