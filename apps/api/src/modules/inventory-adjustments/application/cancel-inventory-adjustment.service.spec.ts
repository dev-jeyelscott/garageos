import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { ProductStore } from '../../products/application/product.store';
import { CancelInventoryAdjustmentService } from './cancel-inventory-adjustment.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentWithLinesRecord,
} from './inventory-adjustment.records';
import {
  InventoryAdjustmentStore,
  type InsertStatusEventInput,
  type MarkAdjustmentCancelledInput,
} from './inventory-adjustment.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const adjustmentId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

describe('CancelInventoryAdjustmentService', () => {
  it('cancels draft adjustments with status history and audit only', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT }),
      lines: [createLine()],
    });

    const response = await fixture.service.cancel(
      adjustmentId,
      { reason: 'Duplicate adjustment request.' },
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment.status).toBe('cancelled');
    expect(fixture.store.markCancelledInput).toMatchObject({
      tenantId,
      adjustmentId,
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      tenantId,
      adjustmentId,
      fromStatus: 'draft',
      toStatus: 'cancelled',
      reason: 'Duplicate adjustment request.',
      createdByUserId: userId,
    });
    expect(fixture.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        actorUserId: userId,
        action: 'inventory_adjustments.cancelled',
        entityType: 'inventory_adjustment',
        entityId: adjustmentId,
        branchId,
        reason: 'Duplicate adjustment request.',
      }),
    );
  });

  it('cancels pending approval adjustments', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL }),
      lines: [createLine()],
    });

    const response = await fixture.service.cancel(
      adjustmentId,
      { reason: 'Count was entered against the wrong branch.' },
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment.status).toBe('cancelled');
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'pending_approval',
      toStatus: 'cancelled',
      reason: 'Count was entered against the wrong branch.',
    });
  });

  it.each([
    INVENTORY_ADJUSTMENT_STATUSES.APPROVED,
    INVENTORY_ADJUSTMENT_STATUSES.POSTED,
    INVENTORY_ADJUSTMENT_STATUSES.REJECTED,
    INVENTORY_ADJUSTMENT_STATUSES.CANCELLED,
  ])('blocks cancellation from %s status', async (status) => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status }),
      lines: [createLine()],
    });

    await expect(
      fixture.service.cancel(
        adjustmentId,
        { reason: 'Attempt invalid cancellation.' },
        createTenantSession(['inventory.adjust']),
      ),
    ).rejects.toMatchObject({ code: 'workflow_transition_blocked' });

    expect(fixture.store.markCancelledInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });

  it('requires inventory.adjust permission', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT }),
      lines: [createLine()],
    });

    await expect(
      fixture.service.cancel(
        adjustmentId,
        { reason: 'Duplicate adjustment request.' },
        createTenantSession([]),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.adjust' }],
    });

    expect(fixture.store.markCancelledInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });

  it('enforces branch access', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT }),
      lines: [createLine()],
    });

    await expect(
      fixture.service.cancel(
        adjustmentId,
        { reason: 'Duplicate adjustment request.' },
        createTenantSession(['inventory.adjust'], { branches: [] }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expect(fixture.store.markCancelledInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });

  it('requires cancellation reason', async () => {
    const fixture = createFixture({
      adjustment: createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT }),
      lines: [createLine()],
    });

    await expect(
      fixture.service.cancel(
        adjustmentId,
        { reason: '' },
        createTenantSession(['inventory.adjust']),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });

    expect(fixture.store.markCancelledInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });
});

function createFixture(input: {
  readonly adjustment: InventoryAdjustmentRecord;
  readonly lines: readonly InventoryAdjustmentLineRecord[];
}) {
  const store = new FakeInventoryAdjustmentStore(input.adjustment, input.lines);
  const productStore = new FakeProductStore();
  const auditService = {
    record: vi.fn().mockResolvedValue({ id: 'audit-id' }),
  } as unknown as AuditService;
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    auditService,
    service: new CancelInventoryAdjustmentService(
      store,
      productStore,
      auditService,
      transactionRunner,
    ),
  };
}

class FakeInventoryAdjustmentStore extends InventoryAdjustmentStore {
  markCancelledInput: MarkAdjustmentCancelledInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(
    private adjustment: InventoryAdjustmentRecord,
    private readonly lines: readonly InventoryAdjustmentLineRecord[],
  ) {
    super();
  }

  async lockAdjustmentWithLinesForUpdate(): Promise<InventoryAdjustmentWithLinesRecord | null> {
    return {
      adjustment: this.adjustment,
      lines: this.lines,
    };
  }

  async markAdjustmentCancelled(input: MarkAdjustmentCancelledInput) {
    this.markCancelledInput = input;
    this.adjustment = {
      ...this.adjustment,
      status: INVENTORY_ADJUSTMENT_STATUSES.CANCELLED,
      updatedAt: input.updatedAt,
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
  lockAdjustmentWithLinesForPosting = vi.fn();
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

  findProductById = vi.fn();
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
    adjustmentNumber: 'IA-20260701-000001',
    status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
    reason: 'Physical count variance.',
    valueImpact: '500.00',
    approvalRequired: false,
    requestedByUserId: userId,
    approvedByUserId: null,
    postedAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
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
    unitCost: '500.00',
    estimatedFifoCost: null,
    ...overrides,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly branches?: readonly { readonly id: string }[];
    readonly tenantWideBranchAccess?: boolean;
  } = {},
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
    branches: overrides.branches ?? [{ id: branchId }],
    tenant_wide_branch_access: overrides.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}
