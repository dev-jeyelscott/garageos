import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { LowStockAlertService } from './low-stock-alert.service';
import {
  LowStockAlertStore,
  type ListLowStockAlertsInput,
  type LowStockAlertRecord,
  type LowStockAlertRefreshRecord,
  type RefreshLowStockAlertInput,
} from './low-stock-alert.store';
import type { StockAvailabilitySnapshot } from './inventory-stock-balances.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH_ID = '99999999-9999-4999-8999-999999999999';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const ALERT_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-06-30T00:00:00.000Z');

describe('LowStockAlertService', () => {
  it('requires inventory.read permission when user is not shop owner', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(
      service.listActiveAlerts(
        {
          branch_id: undefined,
          product_id: undefined,
          category_id: undefined,
          q: undefined,
          limit: 50,
        },
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'inventory.read' }],
    });
  });

  it('allows active low-stock alert reads for read-only tenants', async () => {
    const { service, store } = createService();
    store.alerts = [createLowStockAlertRecord()];

    const response = await service.listActiveAlerts(
      {
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        category_id: CATEGORY_ID,
        q: ' Engine   Oil ',
        limit: 25,
      },
      createTenantSession(['inventory.read'], {
        tenantStatus: 'read_only',
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.listInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchIds: [BRANCH_ID],
      productId: PRODUCT_ID,
      categoryId: CATEGORY_ID,
      normalizedSearch: 'engine oil',
      limit: 25,
    });

    expect(response.low_stock_alerts[0]).toMatchObject({
      id: ALERT_ID,
      branch: {
        id: BRANCH_ID,
        name: 'Main Branch',
      },
      product: {
        id: PRODUCT_ID,
        sku: 'OIL-10W40-1L',
      },
      available_qty: '4.000',
      reorder_level: '5.000',
      status: 'active',
    });
  });

  it('blocks an explicit branch filter when the user lacks branch access', async () => {
    const { service } = createService();

    await expect(
      service.listActiveAlerts(
        {
          branch_id: OTHER_BRANCH_ID,
          product_id: undefined,
          category_id: undefined,
          q: undefined,
          limit: 50,
        },
        createTenantSession(['inventory.read'], {
          branches: [BRANCH_ID],
          tenantWideBranchAccess: false,
        }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
    });
  });

  it('filters active alerts to assigned branches when no branch filter is supplied', async () => {
    const { service, store } = createService();
    store.alerts = [createLowStockAlertRecord()];

    await service.listActiveAlerts(
      {
        branch_id: undefined,
        product_id: undefined,
        category_id: undefined,
        q: undefined,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.listInputs[0]).toMatchObject({
      branchIds: [BRANCH_ID],
    });
  });

  it('returns an empty list when user has no assigned branches and no tenant-wide access', async () => {
    const { service, store } = createService();

    const response = await service.listActiveAlerts(
      {
        branch_id: undefined,
        product_id: undefined,
        category_id: undefined,
        q: undefined,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [],
        tenantWideBranchAccess: false,
      }),
    );

    expect(response.low_stock_alerts).toEqual([]);
    expect(store.listInputs).toEqual([]);
  });

  it('refreshes low-stock alert state from a stock availability snapshot', async () => {
    const { service, store } = createService();
    store.refreshResult = createLowStockAlertRefreshRecord({
      status: 'active',
      availableQty: '4.000',
      reorderLevel: '5.000',
      resolvedAt: null,
    });

    const result = await service.refreshForStockAvailability(
      createStockAvailabilitySnapshot({
        available_qty: '4.000',
      }),
      {} as DatabaseQueryClient,
    );

    expect(store.refreshInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
    });
    expect(result).toMatchObject({
      status: 'active',
      availableQty: '4.000',
      reorderLevel: '5.000',
    });
  });
});

function createService(): {
  readonly service: LowStockAlertService;
  readonly store: FakeLowStockAlertStore;
} {
  const store = new FakeLowStockAlertStore();

  return {
    service: new LowStockAlertService(store),
    store,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantStatus?: TenantStatus;
    readonly branches?: readonly string[];
    readonly tenantWideBranchAccess?: boolean;
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
    branches: (overrides.branches ?? []).map((branchId) => ({
      id: branchId,
    })),
    tenant_wide_branch_access: overrides.tenantWideBranchAccess ?? true,
    subscription_status_source: 'system_computed',
  };
}

function createStockAvailabilitySnapshot(
  overrides: Partial<StockAvailabilitySnapshot> = {},
): StockAvailabilitySnapshot {
  return {
    tenant_id: TENANT_ID,
    branch_id: BRANCH_ID,
    product_id: PRODUCT_ID,
    on_hand_qty: '7.000',
    reserved_qty: '3.000',
    available_qty: '4.000',
    lock_version: 1,
    ...overrides,
  };
}

function createLowStockAlertRecord(
  overrides: Partial<LowStockAlertRecord> = {},
): LowStockAlertRecord {
  return {
    id: ALERT_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    branchName: 'Main Branch',
    branchStatus: 'active',
    productId: PRODUCT_ID,
    productName: 'Engine Oil 10W-40 1L',
    sku: 'OIL-10W40-1L',
    barcode: '4800000000012',
    brand: 'Motul',
    unitOfMeasure: 'piece',
    productStatus: 'active',
    categoryId: CATEGORY_ID,
    categoryName: 'Engine Oil',
    categoryStatus: 'active',
    availableQty: '4.000',
    reorderLevel: '5.000',
    status: 'active',
    triggeredAt: NOW,
    resolvedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function createLowStockAlertRefreshRecord(
  overrides: Partial<LowStockAlertRefreshRecord> = {},
): LowStockAlertRefreshRecord {
  return {
    id: ALERT_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    availableQty: '4.000',
    reorderLevel: '5.000',
    status: 'active',
    triggeredAt: NOW,
    resolvedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

class FakeLowStockAlertStore extends LowStockAlertStore {
  isOwner = false;
  alerts: readonly LowStockAlertRecord[] = [];
  refreshResult: LowStockAlertRefreshRecord | null = null;
  readonly listInputs: ListLowStockAlertsInput[] = [];
  readonly refreshInputs: RefreshLowStockAlertInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listActiveAlerts(input: ListLowStockAlertsInput): Promise<readonly LowStockAlertRecord[]> {
    this.listInputs.push(input);

    return this.alerts;
  }

  async refreshForStockBalance(
    input: RefreshLowStockAlertInput,
  ): Promise<LowStockAlertRefreshRecord | null> {
    this.refreshInputs.push(input);

    return this.refreshResult;
  }
}
