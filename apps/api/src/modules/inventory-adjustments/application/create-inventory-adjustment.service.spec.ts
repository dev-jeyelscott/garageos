import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import { CreateInventoryAdjustmentService } from './create-inventory-adjustment.service';
import { InventoryAdjustmentApprovalPolicy } from './inventory-adjustment-approval-policy';
import { InventoryAdjustmentNumberService } from './inventory-adjustment-number.service';
import { InventoryAdjustmentValueImpactService } from './inventory-adjustment-value-impact.service';
import {
  InventoryAdjustmentStore,
  type CreateDraftAdjustmentInput,
  type CreateDraftAdjustmentLinesInput,
  type InsertStatusEventInput,
} from './inventory-adjustment.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

describe('CreateInventoryAdjustmentService', () => {
  it('requires inventory.adjust for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.createDraft(createRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.adjust' }],
    });
  });

  it('creates a final counted draft with stock snapshot, value impact, and status event', async () => {
    const fixture = createFixture();

    const response = await fixture.service.createDraft(
      createRequest(),
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment).toMatchObject({
      status: 'draft',
      value_impact: '440.00',
      approval_required: false,
    });
    expect(response.adjustment.adjustment_number).toMatch(/^IA-\d{8}-000001$/);
    expect(response.lines[0]).toMatchObject({
      product_id: productId,
      adjustment_type: 'final_counted_quantity',
      quantity_difference: '-2.000',
      final_counted_quantity: '8.000',
      estimated_fifo_cost: '440.00',
      stock_snapshot: {
        on_hand_quantity: '10.000',
        reserved_quantity: '1.000',
        available_quantity: '9.000',
      },
    });
    expect(fixture.store.createDraftAdjustmentInput).toMatchObject({
      tenantId,
      branchId,
      valueImpact: '440.00',
      approvalRequired: false,
      requestedByUserId: userId,
    });
    expect(fixture.store.createDraftAdjustmentLinesInput?.lines[0]).toMatchObject({
      productId,
      adjustmentType: 'final_count',
      quantityDifference: '-2.000',
      finalCountedQuantity: '8.000',
      estimatedFifoCost: '440.00',
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      tenantId,
      fromStatus: null,
      toStatus: 'draft',
      createdByUserId: userId,
    });
    expect(fixture.store.mutatingInventoryTablesTouched).toBe(false);
  });

  it('marks drafts requiring approval at the default threshold', async () => {
    const fixture = createFixture();

    await fixture.service.createDraft(
      createRequest({
        final_counted_quantity: '12.000',
        unit_cost: '2500.00',
      }),
      createTenantSession(['inventory.adjust']),
    );

    expect(fixture.store.createDraftAdjustmentInput?.valueImpact).toBe('5000.00');
    expect(fixture.store.createDraftAdjustmentInput?.approvalRequired).toBe(true);
  });
});

function createFixture() {
  const store = new FakeInventoryAdjustmentStore('220.00');
  const productStore = new FakeProductStore();
  const stockBalancesService = {
    getAvailableStock: vi.fn(async () => ({
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: productId,
      on_hand_qty: '10.000',
      reserved_qty: '1.000',
      available_qty: '9.000',
      lock_version: 0,
    })),
  } as unknown as InventoryStockBalancesService;
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  const valueImpactService = new InventoryAdjustmentValueImpactService(store);
  const approvalPolicy = new InventoryAdjustmentApprovalPolicy(store);
  const numberService = new InventoryAdjustmentNumberService(store);

  return {
    store,
    service: new CreateInventoryAdjustmentService(
      store,
      productStore,
      stockBalancesService,
      valueImpactService,
      approvalPolicy,
      numberService,
      transactionRunner,
    ),
  };
}

class FakeInventoryAdjustmentStore extends InventoryAdjustmentStore {
  createDraftAdjustmentInput: CreateDraftAdjustmentInput | null = null;
  createDraftAdjustmentLinesInput: CreateDraftAdjustmentLinesInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;
  mutatingInventoryTablesTouched = false;

  constructor(private readonly fifoUnitCost: string) {
    super();
  }

  async createDraftAdjustment(input: CreateDraftAdjustmentInput) {
    this.createDraftAdjustmentInput = input;

    return {
      ...input,
      status: 'draft' as const,
      approvedByUserId: null,
      postedAt: null,
      updatedAt: input.createdAt,
      lockVersion: 0,
    };
  }

  async createDraftAdjustmentLines(input: CreateDraftAdjustmentLinesInput) {
    this.createDraftAdjustmentLinesInput = input;

    return input.lines.map((line) => ({
      ...line,
      tenantId: input.tenantId,
      adjustmentId: input.adjustmentId,
    }));
  }

  async insertStatusEvent(input: InsertStatusEventInput) {
    this.insertStatusEventInput = input;

    return input;
  }

  async findLatestAdjustmentNumberForDate() {
    return null;
  }

  async findTenantAdjustmentApprovalThreshold() {
    return null;
  }

  async listFifoCostLayers() {
    return [
      {
        remainingQuantity: '10.000',
        activeReservedQuantity: '0.000',
        allocatableQuantity: '10.000',
        unitCost: this.fifoUnitCost,
      },
    ];
  }

  updateDraftAdjustment = vi.fn();
  replaceDraftAdjustmentLines = vi.fn();
  findAdjustmentWithLines = vi.fn();
  lockAdjustmentWithLinesForPosting = vi.fn();
  listStatusEvents = vi.fn();
  listAdjustments = vi.fn();
}

class FakeProductStore extends ProductStore {
  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    return {
      id: productId,
      tenantId,
      categoryId: '55555555-5555-4555-8555-555555555555',
      category: {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Parts',
        status: 'active',
      },
      name: 'Oil',
      normalizedName: 'oil',
      sku: 'OIL',
      normalizedSku: 'oil',
      barcode: null,
      normalizedBarcode: null,
      supplierCode: null,
      brand: null,
      unitOfMeasure: 'piece',
      defaultCost: '220.00',
      sellingPrice: '300.00',
      reorderLevel: '1.000',
      description: null,
      status: 'active',
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      createdByUserId: userId,
      updatedAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedByUserId: userId,
      deactivatedAt: null,
      reactivatedAt: null,
      lockVersion: 0,
    };
  }

  listProducts = vi.fn();
  findActiveProductCategoryById = vi.fn();
  createProduct = vi.fn();
  updateProduct = vi.fn();
  changeProductStatus = vi.fn();
  findProductDeactivationBlockers = vi.fn();
}

function createRequest(overrides: { final_counted_quantity?: string; unit_cost?: string } = {}) {
  return {
    branch_id: branchId,
    reason: 'Physical count variance during monthly count.',
    lines: [
      {
        product_id: productId,
        adjustment_type: 'final_counted_quantity' as const,
        final_counted_quantity: overrides.final_counted_quantity ?? '8.000',
        unit_cost: overrides.unit_cost ?? '220.00',
      },
    ],
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
