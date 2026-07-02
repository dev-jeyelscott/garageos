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
  type CreateSupplierPaymentInput,
  type ListSuppliersInput,
  SupplierStore,
  type SupplierDeactivationBlocker,
  type SupplierPaymentRecord,
  type SupplierRecord,
  type UpdateSupplierInput,
} from './supplier.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_PAYMENT_ID = '55555555-5555-4555-8555-555555555555';
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

describe('SupplierService supplier payments', () => {
  it('records a supplier payment with tenant scope, AP balance validation, and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditRecords } = createService();
      store.lockedSupplier = createSupplierRecord();
      store.payableBalance = '1250.00';

      const response = await service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest({ amount: '500.00' }),
        createTenantSession(['supplier_payments.create']),
      );

      expect(store.lockInputs[0]).toEqual({ tenantId: TENANT_ID, supplierId: SUPPLIER_ID });
      expect(store.balanceInputs[0]).toEqual({ tenantId: TENANT_ID, supplierId: SUPPLIER_ID });
      expect(store.createdPaymentInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        supplierId: SUPPLIER_ID,
        amount: '500.00',
        paymentDate: '2026-07-02',
        paymentMethod: 'bank_transfer',
        referenceNumber: 'BANK-123',
        notes: 'Partial supplier payment',
        createdByUserId: USER_ID,
      });
      expect(response.payment).toMatchObject({
        id: SUPPLIER_PAYMENT_ID,
        supplier_id: SUPPLIER_ID,
        amount: '500.00',
      });
      expect(response.balance).toEqual({
        before_payment: '1250.00',
        payment_amount: '500.00',
        after_payment: '750.00',
      });
      expect(auditRecords[0]).toMatchObject({
        action: 'supplier_payments.created',
        entityType: 'supplier_payment',
        entityId: SUPPLIER_PAYMENT_ID,
        reason: 'supplier_payment_recorded',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires supplier_payments.create permission', async () => {
    const { service } = createService();

    await expect(
      service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest(),
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'supplier_payments.create' }],
    });
  });

  it('blocks supplier payments when tenant lifecycle is read-only', async () => {
    const { service, store } = createService();

    await expect(
      service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest(),
        createTenantSession(['supplier_payments.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });

    expect(store.createdPaymentInputs).toEqual([]);
  });

  it('uses session tenant scope when locating the supplier', async () => {
    const { service, store } = createService();
    store.lockedSupplier = null;

    await expect(
      service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest(),
        createTenantSession(['supplier_payments.create'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.lockInputs[0]).toEqual({ tenantId: OTHER_TENANT_ID, supplierId: SUPPLIER_ID });
    expect(store.createdPaymentInputs).toEqual([]);
  });

  it('blocks supplier payment amounts greater than payable balance', async () => {
    const { service, store } = createService();
    store.lockedSupplier = createSupplierRecord();
    store.payableBalance = '250.00';

    await expect(
      service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest({ amount: '251.00' }),
        createTenantSession(['supplier_payments.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'amount',
          code: 'supplier_payment_exceeds_payable_balance',
        }),
      ],
    });

    expect(store.createdPaymentInputs).toEqual([]);
  });

  it('blocks supplier payments for inactive suppliers', async () => {
    const { service, store } = createService();
    store.lockedSupplier = createSupplierRecord({ status: 'inactive' });

    await expect(
      service.recordSupplierPayment(
        SUPPLIER_ID,
        createSupplierPaymentRequest(),
        createTenantSession(['supplier_payments.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(store.createdPaymentInputs).toEqual([]);
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

function createSupplierPaymentRequest(
  overrides: Partial<ReturnType<typeof createSupplierPaymentRequestBase>> = {},
) {
  return {
    ...createSupplierPaymentRequestBase(),
    ...overrides,
  };
}

function createSupplierPaymentRequestBase() {
  return {
    amount: '500.00',
    payment_date: '2026-07-02',
    payment_method: 'bank_transfer' as const,
    reference_number: 'BANK-123',
    notes: 'Partial supplier payment',
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

function createSupplierPaymentRecord(
  input: CreateSupplierPaymentInput,
  overrides: Partial<SupplierPaymentRecord> = {},
): SupplierPaymentRecord {
  return {
    id: overrides.id ?? SUPPLIER_PAYMENT_ID,
    tenantId: overrides.tenantId ?? input.tenantId,
    supplierId: overrides.supplierId ?? input.supplierId,
    amount: overrides.amount ?? input.amount,
    paymentDate: overrides.paymentDate ?? input.paymentDate,
    paymentMethod: overrides.paymentMethod ?? input.paymentMethod,
    referenceNumber: overrides.referenceNumber ?? input.referenceNumber,
    notes: overrides.notes ?? input.notes,
    createdByUserId: overrides.createdByUserId ?? input.createdByUserId,
    createdAt: overrides.createdAt ?? input.createdAt,
  };
}

class FakeSupplierStore extends SupplierStore {
  suppliers: SupplierRecord[] = [];
  supplierById: SupplierRecord | null = createSupplierRecord();
  lockedSupplier: SupplierRecord | null = createSupplierRecord();
  createdSupplier: SupplierRecord | null = createSupplierRecord();
  updatedSupplier: SupplierRecord | null = createSupplierRecord({ lockVersion: 2 });
  changedSupplier: SupplierRecord | null = createSupplierRecord({ lockVersion: 2 });
  deactivationBlockers: SupplierDeactivationBlocker[] = [];
  payableBalance = '1000.00';
  readonly listInputs: ListSuppliersInput[] = [];
  readonly findInputs: Array<{ tenantId: string; supplierId: string }> = [];
  readonly lockInputs: Array<{ tenantId: string; supplierId: string }> = [];
  readonly balanceInputs: Array<{ tenantId: string; supplierId: string }> = [];
  readonly createdInputs: CreateSupplierInput[] = [];
  readonly updatedInputs: UpdateSupplierInput[] = [];
  readonly changedInputs: ChangeSupplierStatusInput[] = [];
  readonly createdPaymentInputs: CreateSupplierPaymentInput[] = [];

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

  override async lockSupplierById(
    tenantId: string,
    supplierId: string,
  ): Promise<SupplierRecord | null> {
    this.lockInputs.push({ tenantId, supplierId });

    return this.lockedSupplier;
  }

  async createSupplier(input: CreateSupplierInput): Promise<SupplierRecord> {
    this.createdInputs.push(input);

    return this.createdSupplier ?? createSupplierRecord({ id: input.id, name: input.name });
  }

  async updateSupplier(input: UpdateSupplierInput): Promise<SupplierRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedSupplier;
  }

  async changeSupplierStatus(input: ChangeSupplierStatusInput): Promise<SupplierRecord | null> {
    this.changedInputs.push(input);

    return this.changedSupplier;
  }

  async findSupplierDeactivationBlockers(): Promise<readonly SupplierDeactivationBlocker[]> {
    return this.deactivationBlockers;
  }

  override async getSupplierPayableBalanceForUpdate(
    tenantId: string,
    supplierId: string,
  ): Promise<string> {
    this.balanceInputs.push({ tenantId, supplierId });

    return this.payableBalance;
  }

  override async createSupplierPayment(
    input: CreateSupplierPaymentInput,
  ): Promise<SupplierPaymentRecord> {
    this.createdPaymentInputs.push(input);

    return createSupplierPaymentRecord(input);
  }
}
