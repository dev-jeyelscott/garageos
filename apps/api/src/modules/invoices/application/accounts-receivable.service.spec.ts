import { describe, expect, it } from 'vitest';

import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import {
  ACCOUNTS_RECEIVABLE_AGING_BUCKETS,
  type AccountsReceivableInvoiceRecord,
  type AccountsReceivableSummaryRecord,
} from './accounts-receivable.records';
import {
  AccountsReceivableStore,
  type ListAccountsReceivableInput,
  type SummarizeAccountsReceivableInput,
} from './accounts-receivable.store';
import { AccountsReceivableService } from './accounts-receivable.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const otherBranchId = '22222222-2222-4222-8222-999999999999';
const customerId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const invoiceId = '55555555-5555-4555-8555-555555555555';

const baseReceivable: AccountsReceivableInvoiceRecord = {
  invoiceId,
  invoiceNumber: 'INV-20260701-000001',
  customerId,
  customerName: 'Pedro Santos',
  branchId,
  invoiceTotal: '5000.00',
  amountPaid: '2000.00',
  remainingCollectibleBalance: '3000.00',
  dueDate: '2026-07-01',
  status: 'partially_paid',
  agingBucket: ACCOUNTS_RECEIVABLE_AGING_BUCKETS.CURRENT,
};

describe('AccountsReceivableService', () => {
  it('lists accounts receivable for assigned branches with invoice read permission', async () => {
    const store = new FakeAccountsReceivableStore();
    store.receivables = [baseReceivable];
    const service = new AccountsReceivableService(store);

    const result = await service.listAccountsReceivable(
      {
        limit: 50,
      },
      createSession(['invoices.read']),
    );

    expect(result.receivables).toEqual([
      {
        invoice_id: invoiceId,
        invoice_number: 'INV-20260701-000001',
        customer_id: customerId,
        customer_name: 'Pedro Santos',
        branch_id: branchId,
        invoice_total: '5000.00',
        amount_paid: '2000.00',
        remaining_collectible_balance: '3000.00',
        due_date: '2026-07-01',
        status: 'partially_paid',
        aging_bucket: 'current',
      },
    ]);
    expect(store.lastListInput).toMatchObject({
      tenantId,
      branchIds: [branchId],
      branchId: null,
      customerId: null,
      status: null,
      limit: 50,
    });
  });

  it('allows reports.view_basic to list accounts receivable', async () => {
    const store = new FakeAccountsReceivableStore();
    const service = new AccountsReceivableService(store);

    await service.listAccountsReceivable({ limit: 25 }, createSession(['reports.view_basic']));

    expect(store.lastListInput).toMatchObject({
      tenantId,
      branchIds: [branchId],
      limit: 25,
    });
  });

  it('applies explicit branch, customer, status, date, and as-of filters', async () => {
    const store = new FakeAccountsReceivableStore();
    const service = new AccountsReceivableService(store);
    const fromDate = new Date('2026-07-01T00:00:00.000Z');
    const toDate = new Date('2026-07-31T00:00:00.000Z');
    const asOfDate = new Date('2026-08-01T00:00:00.000Z');

    await service.listAccountsReceivable(
      {
        branch_id: branchId,
        customer_id: customerId,
        status: 'overdue',
        from_date: fromDate,
        to_date: toDate,
        as_of_date: asOfDate,
        limit: 10,
      },
      createSession(['invoices.read']),
    );

    expect(store.lastListInput).toMatchObject({
      tenantId,
      branchIds: [branchId],
      branchId,
      customerId,
      status: 'overdue',
      fromDate,
      toDate,
      asOfDate,
      limit: 10,
    });
  });

  it('blocks explicit branch filters outside the user branch assignment', async () => {
    const store = new FakeAccountsReceivableStore();
    const service = new AccountsReceivableService(store);

    await expect(
      service.listAccountsReceivable(
        {
          branch_id: otherBranchId,
          limit: 50,
        },
        createSession(['invoices.read']),
      ),
    ).rejects.toMatchObject({
      code: 'branch_access_denied',
    });

    expect(store.lastListInput).toBeNull();
  });

  it('requires invoices.read or reports.view_basic for the AR list', async () => {
    const store = new FakeAccountsReceivableStore();
    const service = new AccountsReceivableService(store);

    await expect(
      service.listAccountsReceivable({ limit: 50 }, createSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'invoices.read or reports.view_basic' }],
    });
  });

  it('summarizes accounts receivable totals by aging bucket', async () => {
    const store = new FakeAccountsReceivableStore();
    store.summary = [
      {
        agingBucket: ACCOUNTS_RECEIVABLE_AGING_BUCKETS.CURRENT,
        invoiceCount: 2,
        remainingCollectibleBalance: '3000.00',
      },
      {
        agingBucket: ACCOUNTS_RECEIVABLE_AGING_BUCKETS.DAYS_31_60_OVERDUE,
        invoiceCount: 1,
        remainingCollectibleBalance: '1500.50',
      },
    ];
    const service = new AccountsReceivableService(store);

    const result = await service.summarizeAccountsReceivable(
      {},
      createSession(['reports.view_basic']),
    );

    expect(result).toEqual({
      total_open_invoice_count: 3,
      total_remaining_collectible_balance: '4500.50',
      aging_buckets: [
        {
          aging_bucket: 'current',
          invoice_count: 2,
          remaining_collectible_balance: '3000.00',
        },
        {
          aging_bucket: '1_30_days_overdue',
          invoice_count: 0,
          remaining_collectible_balance: '0.00',
        },
        {
          aging_bucket: '31_60_days_overdue',
          invoice_count: 1,
          remaining_collectible_balance: '1500.50',
        },
        {
          aging_bucket: '61_90_days_overdue',
          invoice_count: 0,
          remaining_collectible_balance: '0.00',
        },
        {
          aging_bucket: 'over_90_days_overdue',
          invoice_count: 0,
          remaining_collectible_balance: '0.00',
        },
      ],
    });
    expect(store.lastSummaryInput).toMatchObject({
      tenantId,
      branchIds: [branchId],
      branchId: null,
      customerId: null,
    });
  });

  it('requires reports.view_basic for the AR summary', async () => {
    const store = new FakeAccountsReceivableStore();
    const service = new AccountsReceivableService(store);

    await expect(
      service.summarizeAccountsReceivable({}, createSession(['invoices.read'])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'reports.view_basic' }],
    });
  });
});

function createSession(
  permissions: readonly string[],
  branchIds: readonly string[] = [branchId],
  tenantWideBranchAccess = false,
): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: userId,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: 'active',
    },
    effective_permissions: [...permissions],
    branches: branchIds.map((id) => ({ id })),
    tenant_wide_branch_access: tenantWideBranchAccess,
    subscription_status_source: 'system_computed',
  };
}

class FakeAccountsReceivableStore extends AccountsReceivableStore {
  receivables: readonly AccountsReceivableInvoiceRecord[] = [];
  summary: readonly AccountsReceivableSummaryRecord[] = [];
  lastListInput: ListAccountsReceivableInput | null = null;
  lastSummaryInput: SummarizeAccountsReceivableInput | null = null;

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async listAccountsReceivable(
    input: ListAccountsReceivableInput,
  ): Promise<readonly AccountsReceivableInvoiceRecord[]> {
    this.lastListInput = input;

    return this.receivables.slice(0, input.limit);
  }

  async summarizeAccountsReceivable(
    input: SummarizeAccountsReceivableInput,
  ): Promise<readonly AccountsReceivableSummaryRecord[]> {
    this.lastSummaryInput = input;

    return this.summary;
  }
}
