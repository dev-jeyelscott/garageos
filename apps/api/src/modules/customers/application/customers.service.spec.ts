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
  CustomerStore,
  type CreateCustomerInput,
  type CustomerDuplicateWarningRecord,
  type CustomerRecord,
  type CustomerTagRecord,
  type FindDuplicateWarningsInput,
  type ListCustomersInput,
  type ReplaceCustomerTagAssignmentsInput,
  type UpdateCustomerInput,
  type UpsertCustomerTagInput,
} from './customer.store';
import { CustomersService } from './customers.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const TAG_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('CustomersService', () => {
  it('lists tenant-scoped active customers with customers.read permission', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.customers = [createCustomerRecord()];

    const response = await service.listCustomers(
      { limit: 50 },
      createTenantSession(['customers.read']),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      limit: 50,
    });
    expect(response.customers).toHaveLength(1);
    expect(response.customers[0]).toMatchObject({
      id: CUSTOMER_ID,
      name: 'Pedro Santos',
      status: 'active',
      lock_version: 0,
      tags: ['vip'],
    });
  });

  it('requires customers.read permission for detail', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.customerById = createCustomerRecord();

    await expect(service.getCustomer(CUSTOMER_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'customers.read' }],
    });
  });

  it('uses session tenant scope for detail lookups', async () => {
    const { service, store } = createService();
    store.customerById = null;

    await expect(
      service.getCustomer(
        CUSTOMER_ID,
        createTenantSession(['customers.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      customerId: CUSTOMER_ID,
    });
  });

  it('blocks customer create for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createCustomer(
        createCustomerRequest(),
        createTenantSession(['customers.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('creates a customer with tags, duplicate warnings, and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      store.duplicateWarnings = [
        {
          type: 'similar_name',
          customerId: '66666666-6666-4666-8666-666666666666',
          name: 'Pedro Santo',
          mobileNumber: '+639171111111',
          email: null,
        },
      ];

      const response = await service.createCustomer(
        createCustomerRequest({ tags: ['vip', 'fleet', 'vip'] }),
        createTenantSession(['customers.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        name: 'Pedro Santos',
        normalizedName: 'pedro santos',
        normalizedMobile: '639171234567',
        normalizedEmail: 'pedro@example.com',
      });
      expect(store.upsertedTags.map((tag) => tag.normalizedName)).toEqual(['vip', 'fleet']);
      expect(store.replacedTagAssignments[0]).toMatchObject({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      });
      expect(response.duplicate_warnings).toHaveLength(1);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customers.created',
          entityType: 'customer',
          entityId: CUSTOMER_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates a customer with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.customerById = createCustomerRecord();
    store.updatedCustomer = createCustomerRecord({
      name: 'Pedro Updated',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateCustomer(
      CUSTOMER_ID,
      createUpdateCustomerRequest({ name: 'Pedro Updated' }),
      createTenantSession(['customers.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      expectedLockVersion: 0,
      normalizedName: 'pedro updated',
    });
    expect(response.customer).toMatchObject({
      name: 'Pedro Updated',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'customers.updated',
        entityType: 'customer',
        entityId: CUSTOMER_ID,
      }),
    );
  });

  it('returns version_conflict when customer lock version is stale', async () => {
    const { service, store } = createService();
    store.customerById = createCustomerRecord();
    store.updatedCustomer = null;

    await expect(
      service.updateCustomer(
        CUSTOMER_ID,
        createUpdateCustomerRequest(),
        createTenantSession(['customers.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });
});

function createService(): {
  readonly service: CustomersService;
  readonly store: FakeCustomerStore;
  readonly auditService: AuditService;
} {
  const store = new FakeCustomerStore();
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
    service: new CustomersService(store, new FakeTransactionRunner(), auditService),
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

function createCustomerRequest(overrides: Partial<ReturnType<typeof baseCustomerRequest>> = {}) {
  return {
    ...baseCustomerRequest(),
    ...overrides,
  };
}

function createUpdateCustomerRequest(
  overrides: Partial<ReturnType<typeof baseCustomerRequest> & { lock_version: number }> = {},
) {
  return {
    ...baseCustomerRequest(),
    lock_version: 0,
    ...overrides,
  };
}

function baseCustomerRequest() {
  return {
    name: 'Pedro Santos',
    mobile_number: '+639171234567',
    email: 'pedro@example.com',
    address: 'Quezon City',
    birthday: '1990-04-15',
    notes: 'Prefers weekend service.',
    tags: ['vip'],
  };
}

function createCustomerRecord(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: overrides.id ?? CUSTOMER_ID,
    name: overrides.name ?? 'Pedro Santos',
    mobileNumber: overrides.mobileNumber ?? '+639171234567',
    normalizedMobile: overrides.normalizedMobile ?? '639171234567',
    email: overrides.email ?? 'pedro@example.com',
    normalizedEmail: overrides.normalizedEmail ?? 'pedro@example.com',
    address: overrides.address ?? 'Quezon City',
    birthday: overrides.birthday ?? '1990-04-15',
    notes: overrides.notes ?? 'Prefers weekend service.',
    status: overrides.status ?? 'active',
    mergedIntoCustomerId: overrides.mergedIntoCustomerId ?? null,
    tags: overrides.tags ?? ['vip'],
    lockVersion: overrides.lockVersion ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    createdByUserId: overrides.createdByUserId ?? USER_ID,
    updatedAt: overrides.updatedAt ?? NOW,
    updatedByUserId: overrides.updatedByUserId ?? USER_ID,
    deletedAt: overrides.deletedAt ?? null,
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

class FakeCustomerStore extends CustomerStore {
  isOwner = false;
  customers: CustomerRecord[] = [];
  customerById: CustomerRecord | null = createCustomerRecord();
  createdCustomer: CustomerRecord | null = createCustomerRecord();
  updatedCustomer: CustomerRecord | null = createCustomerRecord({ lockVersion: 1 });
  duplicateWarnings: CustomerDuplicateWarningRecord[] = [];
  readonly listInputs: ListCustomersInput[] = [];
  readonly findInputs: Array<{ tenantId: string; customerId: string }> = [];
  readonly createdInputs: CreateCustomerInput[] = [];
  readonly updatedInputs: UpdateCustomerInput[] = [];
  readonly upsertedTags: UpsertCustomerTagInput[] = [];
  readonly replacedTagAssignments: ReplaceCustomerTagAssignmentsInput[] = [];
  readonly duplicateWarningInputs: FindDuplicateWarningsInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listCustomers(input: ListCustomersInput): Promise<readonly CustomerRecord[]> {
    this.listInputs.push(input);

    return this.customers;
  }

  async findCustomerById(tenantId: string, customerId: string): Promise<CustomerRecord | null> {
    this.findInputs.push({ tenantId, customerId });

    return this.customerById;
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    this.createdInputs.push(input);

    return this.createdCustomer ?? createCustomerRecord({ id: input.id, name: input.name });
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedCustomer;
  }

  async upsertCustomerTag(input: UpsertCustomerTagInput): Promise<CustomerTagRecord> {
    this.upsertedTags.push(input);

    return {
      id: input.normalizedName === 'fleet' ? `${TAG_ID.slice(0, -1)}6` : TAG_ID,
      name: input.name,
      normalizedName: input.normalizedName,
    };
  }

  async replaceCustomerTagAssignments(input: ReplaceCustomerTagAssignmentsInput): Promise<void> {
    this.replacedTagAssignments.push(input);
  }

  async findDuplicateWarnings(
    input: FindDuplicateWarningsInput,
  ): Promise<readonly CustomerDuplicateWarningRecord[]> {
    this.duplicateWarningInputs.push(input);

    return this.duplicateWarnings;
  }
}
