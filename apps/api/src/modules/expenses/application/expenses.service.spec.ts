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
  ExpenseStore,
  type CreateExpenseInput,
  type CreateExpenseStatusEventInput,
  type ExpenseRecord,
  type ExpenseReferenceRecord,
  type ListExpensesInput,
  type UpdateExpenseInput,
  type VoidExpenseInput,
} from './expense.store';
import { ExpensesService } from './expenses.service';

type ExpensePaymentMethod =
  'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit_card' | 'check' | 'other';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const EXPENSE_ID = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('ExpensesService', () => {
  it('lists only assigned branches when the session lacks tenant-wide branch access', async () => {
    const { service, store } = createService();

    await service.listExpenses(
      { status: 'active', limit: 50 },
      createTenantSession(['expenses.read'], {
        tenantWideBranchAccess: false,
        assignedBranchIds: [BRANCH_ID],
      }),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchIds: [BRANCH_ID],
      status: 'active',
      limit: 51,
    });
  });

  it('creates an active expense with branch access, status history, and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createExpense(
        createExpenseRequest({
          description: ' Shop   cleaning supplies ',
          reference_number: ' OR-456 ',
        }),
        createTenantSession(['expenses.create']),
      );

      expect(store.createdInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        categoryId: CATEGORY_ID,
        amount: '850.00',
        description: 'Shop cleaning supplies',
        referenceNumber: 'OR-456',
        createdByUserId: USER_ID,
      });
      expect(store.statusEvents[0]).toMatchObject({
        tenantId: TENANT_ID,
        expenseId: response.expense.id,
        fromStatus: null,
        toStatus: 'active',
        reason: 'expense_created',
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'expenses.created',
          entityType: 'expense',
          entityId: response.expense.id,
          branchId: BRANCH_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks expense creation when the category is inactive', async () => {
    const { service, store } = createService();
    store.reference = createReferenceRecord({ categoryStatus: 'inactive' });

    await expect(
      service.createExpense(createExpenseRequest(), createTenantSession(['expenses.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'expense_category_inactive' })],
    });
  });

  it('blocks expense creation when the branch is inactive', async () => {
    const { service, store } = createService();
    store.reference = createReferenceRecord({ branchStatus: 'inactive' });

    await expect(
      service.createExpense(createExpenseRequest(), createTenantSession(['expenses.create'])),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'branch_inactive' })],
    });
  });

  it('requires an edit reason for active expense updates', async () => {
    const { service, store } = createService();
    store.lockedExpense = createExpenseRecord();

    await expect(
      service.updateExpense(
        EXPENSE_ID,
        createUpdateExpenseRequest({ amount: '900.00', reason: undefined }),
        createTenantSession(['expenses.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'expense_edit_reason_required' })],
    });
  });

  it('requires an edit reason when only the payment method changes', async () => {
    const { service, store } = createService();
    store.lockedExpense = createExpenseRecord();

    await expect(
      service.updateExpense(
        EXPENSE_ID,
        createUpdateExpenseRequest({ payment_method: 'gcash', reason: undefined }),
        createTenantSession(['expenses.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'expense_edit_reason_required' })],
    });
    expect(store.updatedInputs).toHaveLength(0);
  });

  it('updates an active expense with optimistic locking, history, and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.lockedExpense = createExpenseRecord();
    store.updatedExpense = createExpenseRecord({
      amount: '900.00',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.updateExpense(
      EXPENSE_ID,
      createUpdateExpenseRequest({ amount: '900.00', reason: 'Corrected amount.' }),
      createTenantSession(['expenses.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      expenseId: EXPENSE_ID,
      amount: '900.00',
      expectedLockVersion: 0,
      updatedByUserId: USER_ID,
    });
    expect(store.statusEvents[0]).toMatchObject({
      expenseId: EXPENSE_ID,
      fromStatus: 'active',
      toStatus: 'active',
      reason: 'Corrected amount.',
    });
    expect(response.expense).toMatchObject({ amount: '900.00', lock_version: 1 });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expenses.updated',
        reason: 'Corrected amount.',
      }),
    );
  });

  it('blocks updates to voided expenses', async () => {
    const { service, store } = createService();
    store.lockedExpense = createExpenseRecord({ status: 'voided', voidReason: 'Duplicate.' });

    await expect(
      service.updateExpense(
        EXPENSE_ID,
        createUpdateExpenseRequest({ reason: 'Correction.' }),
        createTenantSession(['expenses.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      details: [expect.objectContaining({ code: 'expense_not_active' })],
    });
  });

  it('voids an active expense with reason, status history, and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.lockedExpense = createExpenseRecord();
    store.voidedExpense = createExpenseRecord({
      status: 'voided',
      voidReason: 'Duplicate expense.',
      lockVersion: 1,
      updatedAt: NOW,
    });

    const response = await service.voidExpense(
      EXPENSE_ID,
      { lock_version: 0, reason: 'Duplicate expense.' },
      createTenantSession(['expenses.void']),
    );

    expect(store.voidedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      expenseId: EXPENSE_ID,
      expectedLockVersion: 0,
      voidReason: 'Duplicate expense.',
      voidedByUserId: USER_ID,
    });
    expect(store.statusEvents[0]).toMatchObject({
      fromStatus: 'active',
      toStatus: 'voided',
      reason: 'Duplicate expense.',
    });
    expect(response.expense).toMatchObject({ status: 'voided', void_reason: 'Duplicate expense.' });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expenses.voided',
        reason: 'Duplicate expense.',
      }),
    );
  });

  it('enforces branch access for detail reads', async () => {
    const { service, store } = createService();
    store.expenseById = createExpenseRecord({ branchId: OTHER_BRANCH_ID });

    await expect(
      service.getExpense(
        EXPENSE_ID,
        createTenantSession(['expenses.read'], {
          tenantWideBranchAccess: false,
          assignedBranchIds: [BRANCH_ID],
        }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    });
  });

  it('blocks expense writes for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.createExpense(
        createExpenseRequest(),
        createTenantSession(['expenses.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });
});

function createService(): {
  readonly service: ExpensesService;
  readonly store: FakeExpenseStore;
  readonly auditService: AuditService;
} {
  const store = new FakeExpenseStore();
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
      entityType: 'expense',
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
    service: new ExpensesService(store, new FakeTransactionRunner(), auditService),
    store,
    auditService,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantStatus?: TenantStatus;
    readonly tenantWideBranchAccess?: boolean;
    readonly assignedBranchIds?: readonly string[];
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
    branches: (overrides.assignedBranchIds ?? []).map((id) => ({ id })),
    tenant_wide_branch_access: overrides.tenantWideBranchAccess ?? true,
    subscription_status_source: 'system_computed',
  };
}

type ExpenseRequest = ReturnType<typeof baseExpenseRequest>;

type CreateExpenseRequestOverrides = Partial<ExpenseRequest>;

type UpdateExpenseRequestOverrides = Partial<
  Omit<ExpenseRequest, 'payment_method'> & {
    readonly lock_version: number;
    readonly payment_method: ExpensePaymentMethod;
    readonly reason: string | undefined;
  }
>;

function createExpenseRequest(overrides: CreateExpenseRequestOverrides = {}) {
  return {
    ...baseExpenseRequest(),
    ...overrides,
  };
}

function createUpdateExpenseRequest(overrides: UpdateExpenseRequestOverrides = {}) {
  return {
    ...baseExpenseRequest(),
    lock_version: 0,
    reason: 'Correction.',
    ...overrides,
  };
}

function baseExpenseRequest() {
  return {
    branch_id: BRANCH_ID,
    category_id: CATEGORY_ID,
    expense_date: '2026-06-24',
    amount: '850.00',
    payment_method: 'cash' as const,
    reference_number: 'OR-456',
    description: 'Shop cleaning supplies.',
  };
}

function createReferenceRecord(
  overrides: Partial<ExpenseReferenceRecord> = {},
): ExpenseReferenceRecord {
  return {
    branchId: overrides.branchId ?? BRANCH_ID,
    branchStatus: overrides.branchStatus ?? 'active',
    categoryId: overrides.categoryId ?? CATEGORY_ID,
    categoryStatus: overrides.categoryStatus ?? 'active',
  };
}

function createExpenseRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: overrides.id ?? EXPENSE_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    branchId: overrides.branchId ?? BRANCH_ID,
    branchName: overrides.branchName ?? 'Main Branch',
    categoryId: overrides.categoryId ?? CATEGORY_ID,
    categoryName: overrides.categoryName ?? 'Supplies',
    expenseDate: overrides.expenseDate ?? '2026-06-24',
    amount: overrides.amount ?? '850.00',
    paymentMethod: overrides.paymentMethod ?? 'cash',
    referenceNumber: overrides.referenceNumber ?? 'OR-456',
    description: overrides.description ?? 'Shop cleaning supplies.',
    status: overrides.status ?? 'active',
    voidReason: overrides.voidReason ?? null,
    createdByUserId: overrides.createdByUserId ?? USER_ID,
    createdAt: overrides.createdAt ?? NOW,
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

class FakeExpenseStore extends ExpenseStore {
  isOwner = false;
  expenses: ExpenseRecord[] = [];
  expenseById: ExpenseRecord | null = createExpenseRecord();
  lockedExpense: ExpenseRecord | null = createExpenseRecord();
  reference: ExpenseReferenceRecord | null = createReferenceRecord();
  createdExpense: ExpenseRecord | null = createExpenseRecord();
  updatedExpense: ExpenseRecord | null = createExpenseRecord({ lockVersion: 1 });
  voidedExpense: ExpenseRecord | null = createExpenseRecord({
    status: 'voided',
    voidReason: 'Voided.',
    lockVersion: 1,
  });

  readonly listInputs: ListExpensesInput[] = [];
  readonly createdInputs: CreateExpenseInput[] = [];
  readonly updatedInputs: UpdateExpenseInput[] = [];
  readonly voidedInputs: VoidExpenseInput[] = [];
  readonly statusEvents: CreateExpenseStatusEventInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listExpenses(input: ListExpensesInput): Promise<readonly ExpenseRecord[]> {
    this.listInputs.push(input);

    return this.expenses;
  }

  async findExpenseById(): Promise<ExpenseRecord | null> {
    return this.expenseById;
  }

  async lockExpenseById(): Promise<ExpenseRecord | null> {
    return this.lockedExpense;
  }

  async findExpenseReference(): Promise<ExpenseReferenceRecord | null> {
    return this.reference;
  }

  async createExpense(input: CreateExpenseInput): Promise<ExpenseRecord> {
    this.createdInputs.push(input);

    return (
      this.createdExpense ??
      createExpenseRecord({
        id: input.id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        categoryId: input.categoryId,
        expenseDate: input.expenseDate,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        description: input.description,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
    );
  }

  async updateExpense(input: UpdateExpenseInput): Promise<ExpenseRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedExpense;
  }

  async voidExpense(input: VoidExpenseInput): Promise<ExpenseRecord | null> {
    this.voidedInputs.push(input);

    return this.voidedExpense;
  }

  async createExpenseStatusEvent(input: CreateExpenseStatusEventInput): Promise<void> {
    this.statusEvents.push(input);
  }
}
