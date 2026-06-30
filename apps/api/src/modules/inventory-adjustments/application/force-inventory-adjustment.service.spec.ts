import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import type { ForceInventoryAdjustmentRequest } from '../api/inventory-adjustment.schemas';
import { ForceInventoryAdjustmentService } from './force-inventory-adjustment.service';
import { InventoryAdjustmentNumberService } from './inventory-adjustment-number.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentRecord,
} from './inventory-adjustment.records';
import {
  InventoryAdjustmentStore,
  type CreateDraftAdjustmentInput,
  type CreateDraftAdjustmentLinesInput,
  type InsertStatusEventInput,
} from './inventory-adjustment.store';
import { InventoryAdjustmentValueImpactService } from './inventory-adjustment-value-impact.service';
import { PostInventoryAdjustmentService } from './post-inventory-adjustment.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const adjustmentId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

describe('ForceInventoryAdjustmentService', () => {
  it('creates a reasoned force adjustment and posts it through shared FIFO/ledger effects', async () => {
    const fixture = createFixture();

    const response = await fixture.service.forceAdjust(createRequest(), createTenantSession());

    expect(response.adjustment.status).toBe('posted');
    expect(fixture.store.createDraftInput).toMatchObject({
      tenantId,
      branchId,
      reason: 'Correct exceptional count drift.',
      approvalRequired: false,
      requestedByUserId: userId,
    });
    expect(fixture.store.createLinesInput?.lines[0]).toMatchObject({
      productId,
      adjustmentType: 'increase',
      quantityDifference: '2.000',
      finalCountedQuantity: null,
      unitCost: '25.00',
      estimatedFifoCost: '50.00',
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: null,
      toStatus: 'draft',
      reason: 'Correct exceptional count drift.',
      createdByUserId: userId,
    });
    expect(fixture.postService.postLockedAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustment: expect.objectContaining({ id: adjustmentId, approvalRequired: false }),
        lines: expect.any(Array),
        auditAction: 'inventory_adjustments.force_adjusted',
        auditReason: 'Correct exceptional count drift.',
        auditMetadata: expect.objectContaining({
          force_adjustment: true,
          reason: 'Correct exceptional count drift.',
        }),
      }),
    );
  });

  it('blocks users with only normal adjustment permission before mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.forceAdjust(createRequest(), createTenantSession(['inventory.adjust'])),
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect(fixture.store.createDraftInput).toBeNull();
    expect(fixture.postService.postLockedAdjustment).not.toHaveBeenCalled();
  });

  it('blocks branch access denial before mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.forceAdjust(
        createRequest(),
        createTenantSession(['inventory.force_adjust'], []),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expect(fixture.store.createDraftInput).toBeNull();
    expect(fixture.postService.postLockedAdjustment).not.toHaveBeenCalled();
  });

  it('rejects zero-effect final counted quantities before mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.forceAdjust(
        createRequest({
          lines: [
            {
              product_id: productId,
              final_counted_quantity: '10.000',
            },
          ],
        }),
        createTenantSession(),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });

    expect(fixture.store.createDraftInput).toBeNull();
    expect(fixture.postService.postLockedAdjustment).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const store = new FakeInventoryAdjustmentStore();
  const productStore = new FakeProductStore();
  const stockBalancesService = {
    getAvailableStock: vi.fn().mockResolvedValue({
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: productId,
      on_hand_qty: '10.000',
      reserved_qty: '2.000',
      available_qty: '8.000',
      lock_version: 1,
    }),
  } as unknown as InventoryStockBalancesService;
  const valueImpactService = {
    calculateLineImpact: vi.fn().mockResolvedValue({
      valueImpact: '50.00',
      estimatedFifoCost: '50.00',
    }),
  } as unknown as InventoryAdjustmentValueImpactService;
  const numberService = {
    allocateNumber: vi.fn().mockResolvedValue('IA-20260630-000001'),
  } as unknown as InventoryAdjustmentNumberService;
  const postService = {
    postLockedAdjustment: vi.fn().mockResolvedValue({
      adjustment: { id: adjustmentId, status: INVENTORY_ADJUSTMENT_STATUSES.POSTED },
      lines: [],
      line_results: [],
    }),
  } as unknown as PostInventoryAdjustmentService;
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    postService,
    service: new ForceInventoryAdjustmentService(
      store,
      productStore,
      stockBalancesService,
      valueImpactService,
      numberService,
      postService,
      transactionRunner,
    ),
  };
}

class FakeInventoryAdjustmentStore extends InventoryAdjustmentStore {
  createDraftInput: CreateDraftAdjustmentInput | null = null;
  createLinesInput: CreateDraftAdjustmentLinesInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  async createDraftAdjustment(input: CreateDraftAdjustmentInput) {
    this.createDraftInput = input;
    return createAdjustment(input);
  }

  async createDraftAdjustmentLines(input: CreateDraftAdjustmentLinesInput) {
    this.createLinesInput = input;
    return input.lines.map((line) => createLine(line, input.adjustmentId));
  }

  async insertStatusEvent(input: InsertStatusEventInput) {
    this.insertStatusEventInput = input;
    return input;
  }

  updateDraftAdjustment = vi.fn();
  replaceDraftAdjustmentLines = vi.fn();
  findAdjustmentWithLines = vi.fn();
  lockAdjustmentWithLinesForPosting = vi.fn();
  lockAdjustmentWithLinesForUpdate = vi.fn();
  markAdjustmentPendingApproval = vi.fn();
  markAdjustmentApproved = vi.fn();
  markAdjustmentRejected = vi.fn();
  markAdjustmentPosted = vi.fn();
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

function createRequest(
  overrides: Partial<ForceInventoryAdjustmentRequest> = {},
): ForceInventoryAdjustmentRequest {
  return {
    branch_id: branchId,
    reason: 'Correct exceptional count drift.',
    lines: [
      {
        product_id: productId,
        quantity_difference: '2.000',
        unit_cost: '25.00',
      },
    ],
    ...overrides,
  };
}

function createTenantSession(
  permissions: readonly string[] = ['inventory.force_adjust'],
  branchIds: readonly string[] = [branchId],
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
    effective_permissions: permissions,
    branches: branchIds.map((id) => ({ id })),
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

function createAdjustment(input: CreateDraftAdjustmentInput): InventoryAdjustmentRecord {
  return {
    id: adjustmentId,
    tenantId: input.tenantId,
    branchId: input.branchId,
    adjustmentNumber: input.adjustmentNumber,
    status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
    reason: input.reason,
    valueImpact: input.valueImpact,
    approvalRequired: input.approvalRequired,
    requestedByUserId: input.requestedByUserId,
    approvedByUserId: null,
    postedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    lockVersion: 0,
  };
}

function createLine(
  input: CreateDraftAdjustmentLinesInput['lines'][number],
  lineAdjustmentId: string,
): InventoryAdjustmentLineRecord {
  return {
    id: input.id,
    tenantId,
    adjustmentId: lineAdjustmentId,
    productId: input.productId,
    adjustmentType: input.adjustmentType,
    quantityDifference: input.quantityDifference,
    finalCountedQuantity: input.finalCountedQuantity,
    unitCost: input.unitCost,
    estimatedFifoCost: input.estimatedFifoCost,
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
