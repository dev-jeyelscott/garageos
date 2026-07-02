import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import {
  AccountsPayableStore,
  type AccountsPayableBranchBasisRecord,
  type AccountsPayableListCursor,
  type AccountsPayableReportScope,
  type AccountsPayableSupplierBasisRecord,
  type GetAccountsPayableSummaryInput,
  type ListAccountsPayableInput,
  type ShopOwnerCheckInput,
} from './accounts-payable.store';
import { AccountsPayableService } from './accounts-payable.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BRANCH_ID = '99999999-9999-4999-8999-999999999999';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';

class FakeAccountsPayableStore extends AccountsPayableStore {
  isShopOwner = false;
  supplierBalances: AccountsPayableSupplierBasisRecord[] = [];
  branchBalances: AccountsPayableBranchBasisRecord[] = [];
  listInputs: ListAccountsPayableInput[] = [];
  summaryInputs: GetAccountsPayableSummaryInput[] = [];

  async isActiveShopOwner(_input: ShopOwnerCheckInput): Promise<boolean> {
    return this.isShopOwner;
  }

  async listSupplierBalances(
    input: ListAccountsPayableInput,
    _client?: DatabaseQueryClient,
  ): Promise<readonly AccountsPayableSupplierBasisRecord[]> {
    this.listInputs.push(input);

    const filtered = this.filterSupplierBalances({
      reportScope: input.reportScope,
      branchIds: input.branchIds,
      supplierId: input.supplierId,
      includeZero: input.includeZero,
      cursor: input.cursor,
    });

    return filtered.slice(0, input.limit);
  }

  async getSummaryBasis(
    input: GetAccountsPayableSummaryInput,
    _client?: DatabaseQueryClient,
  ): Promise<{
    readonly suppliers: readonly AccountsPayableSupplierBasisRecord[];
    readonly branches: readonly AccountsPayableBranchBasisRecord[];
  }> {
    this.summaryInputs.push(input);

    return {
      suppliers: this.filterSupplierBalances({
        reportScope: input.reportScope,
        branchIds: input.branchIds,
        supplierId: input.supplierId,
        includeZero: input.includeZero,
        cursor: null,
      }),
      branches: this.branchBalances.filter(
        (balance) => input.supplierId === null || balance.supplierId === input.supplierId,
      ),
    };
  }

  private filterSupplierBalances(input: {
    readonly reportScope: AccountsPayableReportScope;
    readonly branchIds: readonly string[] | null;
    readonly supplierId: string | null;
    readonly includeZero: boolean;
    readonly cursor: AccountsPayableListCursor | null;
  }): readonly AccountsPayableSupplierBasisRecord[] {
    return this.supplierBalances.filter((balance) => {
      if (input.supplierId !== null && balance.supplierId !== input.supplierId) {
        return false;
      }

      if (!input.includeZero && balance.supplierId === SECOND_SUPPLIER_ID) {
        return false;
      }

      if (input.cursor === null) {
        return true;
      }

      return (
        balance.lastActivityAt < input.cursor.lastActivityAt ||
        (balance.lastActivityAt.getTime() === input.cursor.lastActivityAt.getTime() &&
          balance.supplierId < input.cursor.supplierId)
      );
    });
  }
}

function buildSession(input?: {
  readonly permissions?: readonly string[];
  readonly tenantWideBranchAccess?: boolean;
  readonly branches?: readonly string[];
  readonly tenantStatus?: TenantStatus;
}): TenantContextAuthenticatedSession {
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
      status: input?.tenantStatus ?? 'active',
    },
    effective_permissions: input?.permissions ?? [],
    branches: (input?.branches ?? [BRANCH_ID]).map((id) => ({ id })),
    tenant_wide_branch_access: input?.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

function buildSupplierBalance(input?: {
  readonly supplierId?: string;
  readonly creditPurchaseReceivedTotal?: string;
  readonly supplierPaymentTotal?: string;
  readonly supplierCreditTotal?: string;
  readonly lastActivityAt?: Date;
}): AccountsPayableSupplierBasisRecord {
  const supplierId = input?.supplierId ?? SUPPLIER_ID;

  return {
    supplierId,
    supplierName: supplierId === SUPPLIER_ID ? 'Parts Supplier' : 'Zero Supplier',
    supplierStatus: 'active',
    creditPurchaseReceivedTotal: input?.creditPurchaseReceivedTotal ?? '500.00',
    supplierPaymentTotal: input?.supplierPaymentTotal ?? '150.00',
    supplierCreditTotal: input?.supplierCreditTotal ?? '50.00',
    lastActivityAt: input?.lastActivityAt ?? new Date('2026-07-02T00:00:00.000Z'),
  };
}

function buildBranchBalance(input?: {
  readonly branchId?: string;
  readonly supplierId?: string;
  readonly creditPurchaseReceivedTotal?: string;
  readonly supplierCreditTotal?: string;
}): AccountsPayableBranchBasisRecord {
  return {
    branchId: input?.branchId ?? BRANCH_ID,
    branchName: 'Main Branch',
    branchStatus: 'active',
    supplierId: input?.supplierId ?? SUPPLIER_ID,
    supplierName: 'Parts Supplier',
    creditPurchaseReceivedTotal: input?.creditPurchaseReceivedTotal ?? '500.00',
    supplierCreditTotal: input?.supplierCreditTotal ?? '125.00',
    lastActivityAt: new Date('2026-07-02T00:00:00.000Z'),
  };
}

describe('AccountsPayableService', () => {
  it('calculates tenant AP from credit purchase receiving, supplier payments, and supplier credits', async () => {
    const store = new FakeAccountsPayableStore();
    store.supplierBalances = [
      buildSupplierBalance({
        creditPurchaseReceivedTotal: '1000.00',
        supplierPaymentTotal: '350.00',
        supplierCreditTotal: '125.00',
      }),
    ];
    const service = new AccountsPayableService(store);

    const response = await service.listPayables(
      {
        include_zero: false,
        limit: 50,
      },
      buildSession({ permissions: ['supplier_payments.read'], tenantWideBranchAccess: true }),
    );

    expect(response.scope).toBe('tenant');
    expect(response.branch_ids).toBeNull();
    expect(response.balances[0]).toMatchObject({
      supplier_id: SUPPLIER_ID,
      credit_purchase_received_total: '1000.00',
      supplier_payment_total: '350.00',
      supplier_credit_total: '125.00',
      payable_balance: '525.00',
    });
    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      reportScope: 'tenant',
      branchIds: null,
      includeZero: false,
    });
  });

  it('keeps cash purchases excluded from AP because they are not part of the payable source basis', async () => {
    const store = new FakeAccountsPayableStore();
    store.supplierBalances = [
      buildSupplierBalance({
        creditPurchaseReceivedTotal: '0.00',
        supplierPaymentTotal: '0.00',
        supplierCreditTotal: '0.00',
        supplierId: SECOND_SUPPLIER_ID,
      }),
    ];
    const service = new AccountsPayableService(store);

    const response = await service.listPayables(
      {
        include_zero: true,
        limit: 50,
      },
      buildSession({ permissions: ['supplier_payments.read'], tenantWideBranchAccess: true }),
    );

    expect(response.balances[0]).toMatchObject({
      supplier_id: SECOND_SUPPLIER_ID,
      credit_purchase_received_total: '0.00',
      supplier_payment_total: '0.00',
      supplier_credit_total: '0.00',
      payable_balance: '0.00',
    });
  });

  it('reports supplier return credits as AP reductions and preserves credit-over-payable negative balances', async () => {
    const store = new FakeAccountsPayableStore();
    store.supplierBalances = [
      buildSupplierBalance({
        creditPurchaseReceivedTotal: '150.00',
        supplierPaymentTotal: '0.00',
        supplierCreditTotal: '200.00',
      }),
    ];
    const service = new AccountsPayableService(store);

    const response = await service.listPayables(
      {
        include_zero: false,
        limit: 50,
      },
      buildSession({ permissions: ['reports.view_basic'], tenantWideBranchAccess: true }),
    );

    expect(response.balances[0]).toMatchObject({
      credit_purchase_received_total: '150.00',
      supplier_payment_total: '0.00',
      supplier_credit_total: '200.00',
      payable_balance: '-50.00',
    });
  });

  it('uses branch-source scope for branch-scoped users without allocating supplier payments to a branch', async () => {
    const store = new FakeAccountsPayableStore();
    store.supplierBalances = [
      buildSupplierBalance({
        creditPurchaseReceivedTotal: '500.00',
        supplierPaymentTotal: '0.00',
        supplierCreditTotal: '125.00',
      }),
    ];
    const service = new AccountsPayableService(store);

    const response = await service.listPayables(
      {
        include_zero: false,
        limit: 50,
      },
      buildSession({ permissions: ['supplier_payments.read'], branches: [BRANCH_ID] }),
    );

    expect(response.scope).toBe('branch_source');
    expect(response.branch_ids).toEqual([BRANCH_ID]);
    expect(response.balances[0]).toMatchObject({
      credit_purchase_received_total: '500.00',
      supplier_payment_total: '0.00',
      supplier_credit_total: '125.00',
      payable_balance: '375.00',
    });
    expect(store.listInputs[0]).toMatchObject({
      reportScope: 'branch_source',
      branchIds: [BRANCH_ID],
    });
  });

  it('blocks branch-specific AP access outside assigned branch scope', async () => {
    const store = new FakeAccountsPayableStore();
    const service = new AccountsPayableService(store);

    await expect(
      service.listPayables(
        {
          branch_id: OTHER_BRANCH_ID,
          include_zero: false,
          limit: 50,
        },
        buildSession({ permissions: ['supplier_payments.read'], branches: [BRANCH_ID] }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('requires supplier payment read or basic report permission for AP list access', async () => {
    const store = new FakeAccountsPayableStore();
    const service = new AccountsPayableService(store);

    await expect(
      service.listPayables(
        {
          include_zero: false,
          limit: 50,
        },
        buildSession({ permissions: [], tenantWideBranchAccess: true }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('requires basic report permission for AP summary access', async () => {
    const store = new FakeAccountsPayableStore();
    const service = new AccountsPayableService(store);

    await expect(
      service.getPayableSummary(
        {
          include_zero: false,
        },
        buildSession({ permissions: ['supplier_payments.read'], tenantWideBranchAccess: true }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('summarizes AP totals by supplier and branch source basis', async () => {
    const store = new FakeAccountsPayableStore();
    store.supplierBalances = [
      buildSupplierBalance({
        creditPurchaseReceivedTotal: '1000.00',
        supplierPaymentTotal: '350.00',
        supplierCreditTotal: '125.00',
      }),
      buildSupplierBalance({
        supplierId: SECOND_SUPPLIER_ID,
        creditPurchaseReceivedTotal: '0.00',
        supplierPaymentTotal: '0.00',
        supplierCreditTotal: '0.00',
      }),
    ];
    store.branchBalances = [
      buildBranchBalance({
        creditPurchaseReceivedTotal: '500.00',
        supplierCreditTotal: '125.00',
      }),
    ];
    const service = new AccountsPayableService(store);

    const response = await service.getPayableSummary(
      {
        include_zero: false,
      },
      buildSession({ permissions: ['reports.view_basic'], tenantWideBranchAccess: true }),
    );

    expect(response.totals).toEqual({
      credit_purchase_received_total: '1000.00',
      supplier_payment_total: '350.00',
      supplier_credit_total: '125.00',
      payable_balance: '525.00',
    });
    expect(response.by_supplier).toHaveLength(1);
    expect(response.by_branch[0]).toMatchObject({
      branch_id: BRANCH_ID,
      supplier_id: SUPPLIER_ID,
      credit_purchase_received_total: '500.00',
      supplier_credit_total: '125.00',
      source_balance: '375.00',
    });
    expect(store.summaryInputs[0]).toMatchObject({
      reportScope: 'tenant',
      branchIds: null,
    });
  });
});
