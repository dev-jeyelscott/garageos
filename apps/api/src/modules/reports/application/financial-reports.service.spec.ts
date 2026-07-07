import { describe, expect, it } from 'vitest';

import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import {
  FinancialReportStore,
  type FinancialReportExpenseBasisInput,
  type FinancialReportExpenseBasisRecord,
} from './financial-report.store';
import { FinancialReportsService } from './financial-reports.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const otherBranchId = '44444444-4444-4444-8444-444444444444';
const categoryId = '55555555-5555-4555-8555-555555555555';

describe('FinancialReportsService', () => {
  it('returns active expense basis scoped to assigned branches', async () => {
    const store = new FakeFinancialReportStore();
    store.expenseBasis = {
      totals: {
        expenseCount: 2,
        totalAmount: '1250.00',
      },
      byCategory: [
        {
          categoryId,
          categoryName: 'Supplies',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
      byBranch: [
        {
          branchId,
          branchName: 'Main Branch',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
      byPaymentMethod: [
        {
          paymentMethod: 'cash',
          expenseCount: 2,
          totalAmount: '1250.00',
        },
      ],
    };
    const service = new FinancialReportsService(store);

    const result = await service.getFinancialReport(
      {
        from_date: '2026-06-01',
        to_date: '2026-06-30',
      },
      createSession(['reports.view_basic']),
    );

    expect(result).toEqual({
      scope: 'branch',
      branch_ids: [branchId],
      period: {
        from_date: '2026-06-01',
        to_date: '2026-06-30',
      },
      operating_expenses: {
        calculation_basis: 'active_expenses_excluding_voided',
        active_expense_count: 2,
        active_expense_total: '1250.00',
        by_category: [
          {
            category_id: categoryId,
            category_name: 'Supplies',
            active_expense_count: 2,
            active_expense_total: '1250.00',
          },
        ],
        by_branch: [
          {
            branch_id: branchId,
            branch_name: 'Main Branch',
            active_expense_count: 2,
            active_expense_total: '1250.00',
          },
        ],
        by_payment_method: [
          {
            payment_method: 'cash',
            active_expense_count: 2,
            active_expense_total: '1250.00',
          },
        ],
      },
    });
    expect(store.lastExpenseBasisInput).toEqual({
      tenantId,
      branchIds: [branchId],
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('uses tenant scope when the session has tenant-wide branch access', async () => {
    const store = new FakeFinancialReportStore();
    const service = new FinancialReportsService(store);

    const result = await service.getFinancialReport(
      {},
      createSession(['reports.view_basic'], [branchId], true),
    );

    expect(result.scope).toBe('tenant');
    expect(result.branch_ids).toBeNull();
    expect(store.lastExpenseBasisInput).toMatchObject({
      tenantId,
      branchIds: null,
      fromDate: null,
      toDate: null,
    });
  });

  it('blocks explicit branch filters outside assignment', async () => {
    const store = new FakeFinancialReportStore();
    const service = new FinancialReportsService(store);

    await expect(
      service.getFinancialReport(
        {
          branch_id: otherBranchId,
        },
        createSession(['reports.view_basic']),
      ),
    ).rejects.toMatchObject({
      code: 'branch_access_denied',
    });

    expect(store.lastExpenseBasisInput).toBeNull();
  });

  it('requires reports.view_basic unless the actor is an active shop owner', async () => {
    const store = new FakeFinancialReportStore();
    const service = new FinancialReportsService(store);

    await expect(service.getFinancialReport({}, createSession([]))).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'reports.view_basic' }],
    });
  });

  it('allows active shop owners to read the report basis', async () => {
    const store = new FakeFinancialReportStore();
    store.shopOwner = true;
    const service = new FinancialReportsService(store);

    await service.getFinancialReport({}, createSession([]));

    expect(store.lastExpenseBasisInput).not.toBeNull();
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

class FakeFinancialReportStore extends FinancialReportStore {
  shopOwner = false;
  expenseBasis: FinancialReportExpenseBasisRecord = {
    totals: {
      expenseCount: 0,
      totalAmount: '0.00',
    },
    byCategory: [],
    byBranch: [],
    byPaymentMethod: [],
  };
  lastExpenseBasisInput: FinancialReportExpenseBasisInput | null = null;

  async isActiveShopOwner(): Promise<boolean> {
    return this.shopOwner;
  }

  async getExpenseBasis(
    input: FinancialReportExpenseBasisInput,
  ): Promise<FinancialReportExpenseBasisRecord> {
    this.lastExpenseBasisInput = input;

    return this.expenseBasis;
  }
}
