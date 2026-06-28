import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { InventoryStockBalancesService } from './inventory-stock-balances.service';
import {
  StockBalanceStore,
  type GetStockAvailabilityInput,
  type ListStockBalancesInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from './stock-balance.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH_ID = '99999999-9999-4999-8999-999999999999';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('InventoryStockBalancesService', () => {
  it('requires inventory.read permission when user is not shop owner', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(
      service.listStockBalances(
        {
          branch_id: undefined,
          product_id: undefined,
          category_id: undefined,
          q: undefined,
          low_stock: false,
          limit: 50,
        },
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'inventory.read' }],
    });
  });

  it('allows stock balance reads for read-only tenants', async () => {
    const { service, store } = createService();
    store.stockBalances = [createStockBalanceRecord()];

    const response = await service.listStockBalances(
      {
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        category_id: CATEGORY_ID,
        q: ' Engine   Oil ',
        low_stock: false,
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
      lowStockOnly: false,
      limit: 25,
    });

    expect(response.stock_balances[0]).toMatchObject({
      branch: {
        id: BRANCH_ID,
        name: 'Main Branch',
      },
      product: {
        id: PRODUCT_ID,
        sku: 'OIL-10W40-1L',
      },
      on_hand_qty: '10.000',
      reserved_qty: '3.000',
      available_qty: '7.000',
      is_low_stock: false,
    });
  });

  it('blocks an explicit branch filter when the user lacks branch access', async () => {
    const { service } = createService();

    await expect(
      service.listStockBalances(
        {
          branch_id: OTHER_BRANCH_ID,
          product_id: undefined,
          category_id: undefined,
          q: undefined,
          low_stock: false,
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

  it('filters stock balances to assigned branches when no branch filter is supplied', async () => {
    const { service, store } = createService();
    store.stockBalances = [createStockBalanceRecord()];

    await service.listStockBalances(
      {
        branch_id: undefined,
        product_id: undefined,
        category_id: undefined,
        q: undefined,
        low_stock: true,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.listInputs[0]).toMatchObject({
      branchIds: [BRANCH_ID],
      lowStockOnly: true,
    });
  });

  it('returns an empty list when user has no assigned branches and no tenant-wide access', async () => {
    const { service, store } = createService();

    const response = await service.listStockBalances(
      {
        branch_id: undefined,
        product_id: undefined,
        category_id: undefined,
        q: undefined,
        low_stock: false,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [],
        tenantWideBranchAccess: false,
      }),
    );

    expect(response.stock_balances).toEqual([]);
    expect(store.listInputs).toEqual([]);
  });

  it('calculates available stock from on-hand minus reserved for internal callers', async () => {
    const { service, store } = createService();
    store.stockAvailability = createStockAvailabilityRecord({
      onHandQty: '12.500',
      reservedQty: '2.125',
      availableQty: '999.999',
    });

    const response = await service.getAvailableStock({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
    });

    expect(store.getAvailabilityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(response).toMatchObject({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      on_hand_qty: '12.500',
      reserved_qty: '2.125',
      available_qty: '10.375',
      lock_version: 0,
    });
  });

  it('locks stock availability for future stock-changing commands', async () => {
    const { service, store } = createService();
    store.stockAvailability = createStockAvailabilityRecord();

    const response = await service.lockAvailableStockForUpdate({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
    });

    expect(store.lockAvailabilityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(response).toMatchObject({
      available_qty: '7.000',
      lock_version: 0,
    });
  });

  it('allows sufficient available stock after locking the stock balance', async () => {
    const { service, store } = createService();
    store.stockAvailability = createStockAvailabilityRecord();

    const response = await service.assertSufficientAvailableStock({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      requestedQuantity: '7',
    });

    expect(store.lockAvailabilityInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(response).toMatchObject({
      on_hand_qty: '10.000',
      reserved_qty: '3.000',
      available_qty: '7.000',
    });
  });

  it('blocks insufficient available stock with the documented inventory error code', async () => {
    const { service, store } = createService();
    store.stockAvailability = createStockAvailabilityRecord();

    await expect(
      service.assertSufficientAvailableStock({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        requestedQuantity: '7.001',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
      details: [
        {
          field: 'requested_qty',
          code: 'insufficient_available_stock',
        },
      ],
    });
  });

  it('treats a missing stock balance as zero available stock', async () => {
    const { service } = createService();

    await expect(
      service.assertSufficientAvailableStock({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        requestedQuantity: '0.001',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
    });
  });

  it('requires requested quantity to be greater than zero', async () => {
    const { service } = createService();

    await expect(
      service.assertSufficientAvailableStock({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        requestedQuantity: '0',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'requested_qty',
          code: 'quantity_must_be_positive',
        },
      ],
    });
  });
});

function createService(): {
  readonly service: InventoryStockBalancesService;
  readonly store: FakeStockBalanceStore;
} {
  const store = new FakeStockBalanceStore();

  return {
    service: new InventoryStockBalancesService(store),
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

function createStockBalanceRecord(overrides: Partial<StockBalanceRecord> = {}): StockBalanceRecord {
  return {
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
    reorderLevel: '5.000',
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    isLowStock: false,
    updatedAt: NOW,
    lockVersion: 0,
    ...overrides,
  };
}

function createStockAvailabilityRecord(
  overrides: Partial<StockAvailabilityRecord> = {},
): StockAvailabilityRecord {
  return {
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    lockVersion: 0,
    ...overrides,
  };
}

class FakeStockBalanceStore extends StockBalanceStore {
  isOwner = false;
  stockBalances: readonly StockBalanceRecord[] = [];
  stockAvailability: StockAvailabilityRecord | null = null;
  readonly listInputs: ListStockBalancesInput[] = [];
  readonly getAvailabilityInputs: GetStockAvailabilityInput[] = [];
  readonly lockAvailabilityInputs: GetStockAvailabilityInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listStockBalances(input: ListStockBalancesInput): Promise<readonly StockBalanceRecord[]> {
    this.listInputs.push(input);

    return this.stockBalances;
  }

  async getStockAvailability(
    input: GetStockAvailabilityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.getAvailabilityInputs.push(input);

    return this.stockAvailability;
  }

  async lockStockAvailabilityForUpdate(
    input: GetStockAvailabilityInput,
  ): Promise<StockAvailabilityRecord | null> {
    this.lockAvailabilityInputs.push(input);

    return this.stockAvailability;
  }
}
