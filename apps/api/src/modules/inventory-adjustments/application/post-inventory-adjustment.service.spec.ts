import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import { AuditService } from '../../../shared/audit/audit.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import type {
  CreateFifoConsumptionCommand,
  FifoConsumptionService,
} from '../../inventory/application/fifo-consumption.service';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import type { FifoLayerAllocationCandidateRecord } from '../../inventory/application/fifo-layer.store';
import type {
  InventoryStockBalancesService,
  StockAvailabilitySnapshot,
} from '../../inventory/application/inventory-stock-balances.service';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import { PostInventoryAdjustmentService } from './post-inventory-adjustment.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentWithLinesRecord,
} from './inventory-adjustment.records';
import {
  InventoryAdjustmentStore,
  type InsertStatusEventInput,
  type MarkAdjustmentPostedInput,
} from './inventory-adjustment.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const adjustmentId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

describe('PostInventoryAdjustmentService', () => {
  it('posts approved positive adjustments with stock, FIFO layer, ledger, status, and audit effects', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.APPROVED }),
      lines: [createLine({ adjustmentType: 'increase', quantityDifference: '2.000' })],
    });

    const response = await fixture.service.post(
      adjustmentId,
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment.status).toBe('posted');
    expect(response.adjustment.posted_at).not.toBeNull();
    expect(response.line_results[0]).toMatchObject({
      product_id: productId,
      adjustment_type: 'positive_adjustment',
      quantity_delta: '2.000',
      unit_cost: '100.00',
      total_cost: '200.00',
      fifo_layer_id: 'fifo-layer-created',
      ledger_entry_id: 'ledger-entry-1',
    });
    expect(fixture.stockBalancesService.incrementOnHandStock).toHaveBeenCalledWith(
      expect.objectContaining({ quantityReceived: '2.000' }),
      expect.anything(),
    );
    expect(fixture.fifoLayerService.createLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityReceived: '2.000',
        unitCost: '100.00',
        sourceTransactionType: 'inventory_adjustment_increase',
        sourceTransactionId: adjustmentId,
      }),
      expect.anything(),
    );
    expect(fixture.ledgerService.recordLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'inventory_adjustment_increase',
        quantityDeltaOnHand: '2.000',
        totalCost: '200.00',
      }),
      expect.anything(),
    );
    expect(fixture.store.markPostedInput).toMatchObject({ tenantId, adjustmentId });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'approved',
      toStatus: 'posted',
      createdByUserId: userId,
    });
    expect(fixture.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inventory_adjustments.posted',
        entityType: 'inventory_adjustment',
        entityId: adjustmentId,
      }),
    );
  });

  it('blocks users with approval-only permission from posting stock-changing adjustments', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.APPROVED }),
      lines: [createLine({ adjustmentType: 'increase', quantityDifference: '2.000' })],
    });

    await expect(
      fixture.service.post(adjustmentId, createTenantSession(['inventory.adjust.approve'])),
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect(fixture.stockBalancesService.incrementOnHandStock).not.toHaveBeenCalled();
    expect(fixture.stockBalancesService.decrementOnHandStock).not.toHaveBeenCalled();
    expect(fixture.fifoLayerService.createLayer).not.toHaveBeenCalled();
    expect(fixture.ledgerService.recordLedgerEntry).not.toHaveBeenCalled();
    expect(fixture.store.markPostedInput).toBeNull();
  });

  it('posts approved negative adjustments by consuming FIFO oldest first', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.APPROVED }),
      lines: [createLine({ adjustmentType: 'decrease', quantityDifference: '-3.000' })],
      fifoCandidates: [
        createFifoCandidate({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          allocatableQuantity: '1.000',
          unitCost: '20.00',
        }),
        createFifoCandidate({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          allocatableQuantity: '2.000',
          unitCost: '30.00',
        }),
      ],
    });

    const response = await fixture.service.post(
      adjustmentId,
      createTenantSession(['inventory.adjust']),
    );

    expect(response.line_results[0]).toMatchObject({
      adjustment_type: 'negative_adjustment',
      quantity_delta: '-3.000',
      unit_cost: null,
      total_cost: '80.00',
      fifo_layer_id: null,
      ledger_entry_id: 'ledger-entry-1',
    });
    expect(response.line_results[0]?.fifo_consumptions).toEqual([
      {
        fifo_layer_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        quantity_consumed: '1.000',
        unit_cost: '20.00',
        total_cost: '20.00',
      },
      {
        fifo_layer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        quantity_consumed: '2.000',
        unit_cost: '30.00',
        total_cost: '60.00',
      },
    ]);
    expect(fixture.fifoLayerService.decrementRemainingQuantity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fifoLayerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        quantityConsumed: '1.000',
      }),
      expect.anything(),
    );
    expect(fixture.fifoConsumptionService.createConsumptions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fifoLayerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          quantityConsumed: '1.000',
        }),
        expect.objectContaining({
          fifoLayerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          quantityConsumed: '2.000',
        }),
      ]),
      expect.anything(),
    );
    expect(fixture.stockBalancesService.decrementOnHandStock).toHaveBeenCalledWith(
      expect.objectContaining({ quantityConsumed: '3.000' }),
      expect.anything(),
    );
    expect(fixture.ledgerService.recordLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'inventory_adjustment_decrease',
        quantityDeltaOnHand: '-3.000',
        totalCost: '80.00',
      }),
      expect.anything(),
    );
  });

  it('posts direct drafts when approval is not required', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({
        status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
        approvalRequired: false,
      }),
      lines: [createLine({ adjustmentType: 'increase', quantityDifference: '1.000' })],
    });

    const response = await fixture.service.post(
      adjustmentId,
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment.status).toBe('posted');
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'posted',
    });
  });

  it('blocks approval-required drafts before touching stock', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({
        status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
        approvalRequired: true,
      }),
      lines: [createLine({ adjustmentType: 'increase', quantityDifference: '1.000' })],
    });

    await expect(
      fixture.service.post(adjustmentId, createTenantSession(['inventory.adjust'])),
    ).rejects.toMatchObject({ code: 'workflow_transition_blocked' });
    expect(fixture.stockBalancesService.incrementOnHandStock).not.toHaveBeenCalled();
    expect(fixture.store.markPostedInput).toBeNull();
  });

  it('recomputes final counted quantity at posting and blocks zero deltas', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({
        status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
        approvalRequired: false,
      }),
      lines: [
        createLine({
          adjustmentType: 'final_count',
          quantityDifference: '5.000',
          finalCountedQuantity: '10.000',
        }),
      ],
      stockSnapshot: createStockSnapshot({ on_hand_qty: '10.000', available_qty: '8.000' }),
    });

    await expect(
      fixture.service.post(adjustmentId, createTenantSession(['inventory.adjust'])),
    ).rejects.toMatchObject({ code: 'workflow_transition_blocked' });
    expect(fixture.stockBalancesService.lockAvailableStockForUpdate).toHaveBeenCalled();
    expect(fixture.stockBalancesService.incrementOnHandStock).not.toHaveBeenCalled();
    expect(fixture.stockBalancesService.decrementOnHandStock).not.toHaveBeenCalled();
  });
});

function createFixture(input: {
  readonly adjustment: InventoryAdjustmentRecord;
  readonly lines: readonly InventoryAdjustmentLineRecord[];
  readonly stockSnapshot?: StockAvailabilitySnapshot;
  readonly fifoCandidates?: readonly FifoLayerAllocationCandidateRecord[];
}) {
  const store = new FakeInventoryAdjustmentStore(input.adjustment, input.lines);
  const productStore = new FakeProductStore();
  const stockSnapshot = input.stockSnapshot ?? createStockSnapshot();
  const stockBalancesService = {
    lockAvailableStockForUpdate: vi.fn().mockResolvedValue(stockSnapshot),
    assertSufficientAvailableStock: vi.fn().mockResolvedValue(stockSnapshot),
    incrementOnHandStock: vi.fn().mockResolvedValue(
      createStockSnapshot({
        on_hand_qty: '12.000',
        reserved_qty: '2.000',
        available_qty: '10.000',
        lock_version: 2,
      }),
    ),
    decrementOnHandStock: vi.fn().mockResolvedValue(
      createStockSnapshot({
        on_hand_qty: '7.000',
        reserved_qty: '2.000',
        available_qty: '5.000',
        lock_version: 2,
      }),
    ),
  } as unknown as InventoryStockBalancesService;
  const fifoLayerService = {
    createLayer: vi.fn().mockImplementation((command) => ({
      id: 'fifo-layer-created',
      remainingQuantity: command.quantityReceived,
      ...command,
    })),
    lockOpenLayersForAllocation: vi
      .fn()
      .mockResolvedValue(input.fifoCandidates ?? [createFifoCandidate()]),
    decrementRemainingQuantity: vi.fn().mockResolvedValue({ id: 'fifo-layer-decremented' }),
  } as unknown as FifoLayerService;
  const fifoConsumptionService = {
    createConsumptions: vi
      .fn()
      .mockImplementation(async (commands: readonly CreateFifoConsumptionCommand[]) =>
        commands.map((command, index) => ({
          id: `fifo-consumption-${index + 1}`,
          ...command,
        })),
      ),
  } as unknown as FifoConsumptionService;
  const ledgerService = {
    recordLedgerEntry: vi.fn().mockImplementation((command) => ({
      id: 'ledger-entry-1',
      ...command,
    })),
  } as unknown as InventoryLedgerService;
  const auditService = {
    record: vi.fn().mockResolvedValue({ id: 'audit-id' }),
  } as unknown as AuditService;
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    productStore,
    stockBalancesService,
    fifoLayerService,
    fifoConsumptionService,
    ledgerService,
    auditService,
    service: new PostInventoryAdjustmentService(
      store,
      productStore,
      stockBalancesService,
      fifoLayerService,
      fifoConsumptionService,
      ledgerService,
      auditService,
      transactionRunner,
    ),
  };
}

class FakeInventoryAdjustmentStore extends InventoryAdjustmentStore {
  markPostedInput: MarkAdjustmentPostedInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(
    private adjustment: InventoryAdjustmentRecord,
    private readonly lines: readonly InventoryAdjustmentLineRecord[],
  ) {
    super();
  }

  async lockAdjustmentWithLinesForPosting(): Promise<InventoryAdjustmentWithLinesRecord | null> {
    return {
      adjustment: this.adjustment,
      lines: this.lines,
    };
  }

  async markAdjustmentPosted(input: MarkAdjustmentPostedInput) {
    this.markPostedInput = input;
    this.adjustment = {
      ...this.adjustment,
      status: INVENTORY_ADJUSTMENT_STATUSES.POSTED,
      postedAt: input.postedAt,
      updatedAt: input.postedAt,
      lockVersion: this.adjustment.lockVersion + 1,
    };
    return this.adjustment;
  }

  async insertStatusEvent(input: InsertStatusEventInput) {
    this.insertStatusEventInput = input;
    return input;
  }

  createDraftAdjustment = vi.fn();
  createDraftAdjustmentLines = vi.fn();
  updateDraftAdjustment = vi.fn();
  replaceDraftAdjustmentLines = vi.fn();
  findAdjustmentWithLines = vi.fn();
  lockAdjustmentWithLinesForUpdate = vi.fn();
  markAdjustmentPendingApproval = vi.fn();
  markAdjustmentApproved = vi.fn();
  markAdjustmentRejected = vi.fn();
  markAdjustmentCancelled = vi.fn();
  listStatusEvents = vi.fn();
  listAdjustments = vi.fn();
  findLatestAdjustmentNumberForDate = vi.fn();
  findTenantAdjustmentApprovalThreshold = vi.fn();
  listFifoCostLayers = vi.fn();
}

class FakeProductStore extends ProductStore {
  async isActiveShopOwner() {
    return false;
  }

  async findProductById() {
    return createProduct();
  }

  listProducts = vi.fn();
  findActiveProductCategoryById = vi.fn();
  createProduct = vi.fn();
  updateProduct = vi.fn();
  changeProductStatus = vi.fn();
  findProductDeactivationBlockers = vi.fn();
}

function createAdjustment(
  overrides: Partial<InventoryAdjustmentRecord> = {},
): InventoryAdjustmentRecord {
  return {
    id: adjustmentId,
    tenantId,
    branchId,
    adjustmentNumber: 'IA-20260630-000001',
    status: INVENTORY_ADJUSTMENT_STATUSES.APPROVED,
    reason: 'Physical count variance.',
    valueImpact: '5000.00',
    approvalRequired: true,
    requestedByUserId: userId,
    approvedByUserId: userId,
    postedAt: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    lockVersion: 0,
    ...overrides,
  };
}

function createLine(
  overrides: Partial<InventoryAdjustmentLineRecord> = {},
): InventoryAdjustmentLineRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    tenantId,
    adjustmentId,
    productId,
    adjustmentType: 'increase',
    quantityDifference: '1.000',
    finalCountedQuantity: null,
    unitCost: null,
    estimatedFifoCost: null,
    ...overrides,
  };
}

function createProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: productId,
    tenantId,
    categoryId: '77777777-7777-4777-8777-777777777777',
    category: {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Parts',
      status: 'active',
    },
    name: 'Oil filter',
    normalizedName: 'oil filter',
    sku: 'OF-1',
    normalizedSku: 'of-1',
    barcode: null,
    normalizedBarcode: null,
    supplierCode: null,
    brand: null,
    unitOfMeasure: 'piece',
    defaultCost: '100.00',
    sellingPrice: '150.00',
    reorderLevel: '2.000',
    description: null,
    status: 'active',
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    createdByUserId: userId,
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedByUserId: userId,
    deactivatedAt: null,
    reactivatedAt: null,
    lockVersion: 0,
    ...overrides,
  };
}

function createStockSnapshot(
  overrides: Partial<StockAvailabilitySnapshot> = {},
): StockAvailabilitySnapshot {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    product_id: productId,
    on_hand_qty: '10.000',
    reserved_qty: '2.000',
    available_qty: '8.000',
    lock_version: 1,
    ...overrides,
  };
}

function createFifoCandidate(
  overrides: Partial<FifoLayerAllocationCandidateRecord> = {},
): FifoLayerAllocationCandidateRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
    branchId,
    productId,
    quantityReceived: '10.000',
    remainingQuantity: '10.000',
    activeReservedQuantity: '0.000',
    allocatableQuantity: '10.000',
    unitCost: '20.00',
    sourceTransactionType: 'purchase_receive',
    sourceTransactionId: '88888888-8888-4888-8888-888888888888',
    receivedAt: new Date('2026-06-01T00:00:00.000Z'),
    originalSourceLayerId: null,
    ...overrides,
  };
}

function createTenantSession(permissions: readonly string[]): TenantContextAuthenticatedSession {
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
    effective_permissions: permissions,
    branches: [{ id: branchId }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}
