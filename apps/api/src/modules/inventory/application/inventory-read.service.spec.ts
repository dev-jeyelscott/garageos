import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { INVENTORY_TRANSACTION_TYPES } from './inventory-ledger.store';
import { InventoryReadService } from './inventory-read.service';
import {
  InventoryReadStore,
  type InventoryReadFifoLayerRecord,
  type InventoryReadLedgerEntryRecord,
  type InventoryReadStockBalanceRecord,
  type ListInventoryLedgerEntriesInput,
  type ListProductFifoLayersInput,
  type ListProductStockInput,
} from './inventory-read.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH_ID = '99999999-9999-4999-8999-999999999999';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const FIFO_LAYER_ID = '66666666-6666-4666-8666-666666666666';
const LEDGER_ENTRY_ID = '77777777-7777-4777-8777-777777777777';
const SOURCE_ID = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('InventoryReadService', () => {
  it('requires inventory.read permission when the user is not shop owner', async () => {
    const { service, store } = createService();
    store.isOwner = false;

    await expect(
      service.listInventoryLedgerEntries(
        {
          branch_id: undefined,
          product_id: undefined,
          transaction_type: undefined,
          source_type: undefined,
          source_id: undefined,
          from_occurred_at: undefined,
          to_occurred_at: undefined,
          limit: 50,
        },
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'inventory.read' }],
    });
  });

  it('allows product stock reads for read-only tenants and explicit accessible branch filters', async () => {
    const { service, store } = createService();
    store.stockBalances = [createStockBalanceRecord()];

    const response = await service.listProductStock(
      PRODUCT_ID,
      {
        branch_id: BRANCH_ID,
        limit: 25,
      },
      createTenantSession(['inventory.read'], {
        tenantStatus: 'read_only',
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.productStockInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchIds: [BRANCH_ID],
        productId: PRODUCT_ID,
        limit: 25,
      },
    ]);
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
    });
  });

  it('blocks explicit FIFO branch reads when the user lacks branch access', async () => {
    const { service } = createService();

    await expect(
      service.listProductFifoLayers(
        PRODUCT_ID,
        {
          branch_id: OTHER_BRANCH_ID,
          open_only: false,
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

  it('filters FIFO reads to assigned branches when no branch filter is supplied', async () => {
    const { service, store } = createService();
    store.fifoLayers = [createFifoLayerRecord()];

    const response = await service.listProductFifoLayers(
      PRODUCT_ID,
      {
        branch_id: undefined,
        open_only: true,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.fifoLayerInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchIds: [BRANCH_ID],
        productId: PRODUCT_ID,
        openOnly: true,
        limit: 50,
      },
    ]);
    expect(response.fifo_layers[0]).toMatchObject({
      id: FIFO_LAYER_ID,
      remaining_quantity: '8.000',
      active_reserved_quantity: '3.000',
      allocatable_quantity: '5.000',
      unit_cost: '250.00',
    });
  });

  it('returns an empty ledger list when user has no assigned branches and no tenant-wide access', async () => {
    const { service, store } = createService();

    const response = await service.listInventoryLedgerEntries(
      {
        branch_id: undefined,
        product_id: undefined,
        transaction_type: undefined,
        source_type: undefined,
        source_id: undefined,
        from_occurred_at: undefined,
        to_occurred_at: undefined,
        limit: 50,
      },
      createTenantSession(['inventory.read'], {
        branches: [],
        tenantWideBranchAccess: false,
      }),
    );

    expect(response.ledger_entries).toEqual([]);
    expect(store.ledgerInputs).toEqual([]);
  });

  it('passes ledger filters through to the read store', async () => {
    const { service, store } = createService();
    store.ledgerEntries = [createLedgerEntryRecord()];

    const from = new Date('2026-06-01T00:00:00.000Z');
    const to = new Date('2026-06-30T23:59:59.000Z');

    const response = await service.listInventoryLedgerEntries(
      {
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        transaction_type: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        source_type: 'job_order_part_line',
        source_id: SOURCE_ID,
        from_occurred_at: from,
        to_occurred_at: to,
        limit: 20,
      },
      createTenantSession(['inventory.read'], {
        branches: [BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
    );

    expect(store.ledgerInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchIds: [BRANCH_ID],
        productId: PRODUCT_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
        sourceType: 'job_order_part_line',
        sourceId: SOURCE_ID,
        fromOccurredAt: from,
        toOccurredAt: to,
        limit: 20,
      },
    ]);
    expect(response.ledger_entries[0]).toMatchObject({
      id: LEDGER_ENTRY_ID,
      transaction_type: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
      quantity_delta_on_hand: '-1.000',
      quantity_delta_reserved: '-1.000',
      total_cost: '250.00',
    });
  });
});

function createService(): {
  readonly service: InventoryReadService;
  readonly store: FakeInventoryReadStore;
} {
  const store = new FakeInventoryReadStore();

  return {
    service: new InventoryReadService(store),
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

function createProductRecord(): InventoryReadStockBalanceRecord['product'] {
  return {
    id: PRODUCT_ID,
    name: 'Engine Oil 10W-40 1L',
    sku: 'OIL-10W40-1L',
    barcode: '4800000000012',
    brand: 'Motul',
    unitOfMeasure: 'piece',
    status: 'active',
    category: {
      id: CATEGORY_ID,
      name: 'Engine Oil',
      status: 'active',
    },
    reorderLevel: '5.000',
  };
}

function createBranchRecord(): InventoryReadStockBalanceRecord['branch'] {
  return {
    id: BRANCH_ID,
    name: 'Main Branch',
    status: 'active',
  };
}

function createStockBalanceRecord(
  overrides: Partial<InventoryReadStockBalanceRecord> = {},
): InventoryReadStockBalanceRecord {
  return {
    branch: createBranchRecord(),
    product: createProductRecord(),
    onHandQty: '10.000',
    reservedQty: '3.000',
    availableQty: '7.000',
    isLowStock: false,
    updatedAt: NOW,
    lockVersion: 0,
    ...overrides,
  };
}

function createFifoLayerRecord(
  overrides: Partial<InventoryReadFifoLayerRecord> = {},
): InventoryReadFifoLayerRecord {
  return {
    id: FIFO_LAYER_ID,
    branch: createBranchRecord(),
    product: createProductRecord(),
    quantityReceived: '10.000',
    remainingQuantity: '8.000',
    activeReservedQuantity: '3.000',
    allocatableQuantity: '5.000',
    unitCost: '250.00',
    sourceTransactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
    sourceTransactionId: SOURCE_ID,
    receivedAt: NOW,
    originalSourceLayerId: null,
    ...overrides,
  };
}

function createLedgerEntryRecord(
  overrides: Partial<InventoryReadLedgerEntryRecord> = {},
): InventoryReadLedgerEntryRecord {
  return {
    id: LEDGER_ENTRY_ID,
    branch: createBranchRecord(),
    product: createProductRecord(),
    transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
    quantityDeltaOnHand: '-1.000',
    quantityDeltaReserved: '-1.000',
    unitCost: null,
    totalCost: '250.00',
    sourceType: 'job_order_part_line',
    sourceId: SOURCE_ID,
    occurredAt: NOW,
    createdByUserId: USER_ID,
    ...overrides,
  };
}

class FakeInventoryReadStore extends InventoryReadStore {
  isOwner = false;
  stockBalances: readonly InventoryReadStockBalanceRecord[] = [];
  fifoLayers: readonly InventoryReadFifoLayerRecord[] = [];
  ledgerEntries: readonly InventoryReadLedgerEntryRecord[] = [];

  readonly productStockInputs: ListProductStockInput[] = [];
  readonly fifoLayerInputs: ListProductFifoLayersInput[] = [];
  readonly ledgerInputs: ListInventoryLedgerEntriesInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listProductStock(
    input: ListProductStockInput,
  ): Promise<readonly InventoryReadStockBalanceRecord[]> {
    this.productStockInputs.push(input);

    return this.stockBalances;
  }

  async listProductFifoLayers(
    input: ListProductFifoLayersInput,
  ): Promise<readonly InventoryReadFifoLayerRecord[]> {
    this.fifoLayerInputs.push(input);

    return this.fifoLayers;
  }

  async listInventoryLedgerEntries(
    input: ListInventoryLedgerEntriesInput,
  ): Promise<readonly InventoryReadLedgerEntryRecord[]> {
    this.ledgerInputs.push(input);

    return this.ledgerEntries;
  }
}
