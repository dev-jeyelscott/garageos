import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { ProductStore } from '../../products/application/product.store';
import { ApproveInventoryAdjustmentService } from './approve-inventory-adjustment.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentRecord,
  type InventoryAdjustmentWithLinesRecord,
} from './inventory-adjustment.records';
import {
  InventoryAdjustmentStore,
  type InsertStatusEventInput,
  type MarkAdjustmentApprovedInput,
  type MarkAdjustmentPendingApprovalInput,
  type MarkAdjustmentRejectedInput,
} from './inventory-adjustment.store';
import { RejectInventoryAdjustmentService } from './reject-inventory-adjustment.service';
import { SubmitInventoryAdjustmentService } from './submit-inventory-adjustment.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const otherBranchId = '22222222-2222-4222-8222-222222222223';
const adjustmentId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

describe('Inventory adjustment action services', () => {
  it('submits approval-required drafts to pending approval', async () => {
    const fixture = createFixture(createAdjustment({ approvalRequired: true }));

    const response = await fixture.submitService.submit(
      adjustmentId,
      createTenantSession(['inventory.adjust']),
    );

    expect(response.adjustment.status).toBe('pending_approval');
    expect(fixture.store.markPendingApprovalInput).toMatchObject({ tenantId, adjustmentId });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'pending_approval',
      createdByUserId: userId,
    });
    expect(fixture.store.mutatingInventoryTablesTouched).toBe(false);
  });

  it('blocks submit when inventory.adjust is missing', async () => {
    const fixture = createFixture(createAdjustment({ approvalRequired: true }));

    await expect(
      fixture.submitService.submit(adjustmentId, createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.adjust' }],
    });
  });

  it('blocks submit for inaccessible branches', async () => {
    const fixture = createFixture(
      createAdjustment({ branchId: otherBranchId, approvalRequired: true }),
    );

    await expect(
      fixture.submitService.submit(adjustmentId, createTenantSession(['inventory.adjust'])),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('approves pending adjustments and records approver', async () => {
    const fixture = createFixture(
      createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL }),
    );

    const response = await fixture.approveService.approve(
      adjustmentId,
      { reason: 'Approved after manager review.' },
      createTenantSession(['inventory.adjust.approve']),
    );

    expect(response.adjustment.status).toBe('approved');
    expect(response.adjustment.approved_by_user_id).toBe(userId);
    expect(fixture.store.markApprovedInput).toMatchObject({
      tenantId,
      adjustmentId,
      approvedByUserId: userId,
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'pending_approval',
      toStatus: 'approved',
      reason: 'Approved after manager review.',
    });
    expect(fixture.store.mutatingInventoryTablesTouched).toBe(false);
  });

  it('rejects pending adjustments with a required reason', async () => {
    const fixture = createFixture(
      createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL }),
    );

    const response = await fixture.rejectService.reject(
      adjustmentId,
      { reason: 'Count sheet did not match physical recount.' },
      createTenantSession(['inventory.adjust.approve']),
    );

    expect(response.adjustment.status).toBe('rejected');
    expect(fixture.store.markRejectedInput).toMatchObject({ tenantId, adjustmentId });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'pending_approval',
      toStatus: 'rejected',
      reason: 'Count sheet did not match physical recount.',
    });
    expect(fixture.store.mutatingInventoryTablesTouched).toBe(false);
  });

  it('blocks invalid transitions', async () => {
    const fixture = createFixture(
      createAdjustment({ status: INVENTORY_ADJUSTMENT_STATUSES.POSTED }),
    );

    await expect(
      fixture.approveService.approve(
        adjustmentId,
        {},
        createTenantSession(['inventory.adjust.approve']),
      ),
    ).rejects.toMatchObject({ code: 'workflow_transition_blocked' });
  });

  it.each([
    INVENTORY_ADJUSTMENT_STATUSES.POSTED,
    INVENTORY_ADJUSTMENT_STATUSES.REJECTED,
    INVENTORY_ADJUSTMENT_STATUSES.CANCELLED,
  ])('surfaces terminal %s adjustments as workflow errors', async (status) => {
    const fixture = createFixture(createAdjustment({ status }));
    const session = createTenantSession(['inventory.adjust', 'inventory.adjust.approve']);

    await expect(fixture.submitService.submit(adjustmentId, session)).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });

    await expect(fixture.approveService.approve(adjustmentId, {}, session)).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });

    await expect(
      fixture.rejectService.reject(adjustmentId, { reason: 'Not valid for approval.' }, session),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });
  });

  it('returns resource_not_found when the adjustment is missing', async () => {
    const fixture = createFixture(null);

    await expect(
      fixture.rejectService.reject(
        adjustmentId,
        { reason: 'Missing count sheet.' },
        createTenantSession(['inventory.adjust.approve']),
      ),
    ).rejects.toMatchObject({ code: 'resource_not_found' });
  });
});

function createFixture(adjustment: InventoryAdjustmentRecord | null) {
  const store = new FakeInventoryAdjustmentStore(adjustment);
  const productStore = new FakeProductStore();
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    submitService: new SubmitInventoryAdjustmentService(store, productStore, transactionRunner),
    approveService: new ApproveInventoryAdjustmentService(store, productStore, transactionRunner),
    rejectService: new RejectInventoryAdjustmentService(store, productStore, transactionRunner),
  };
}

class FakeInventoryAdjustmentStore extends InventoryAdjustmentStore {
  insertStatusEventInput: InsertStatusEventInput | null = null;
  markPendingApprovalInput: MarkAdjustmentPendingApprovalInput | null = null;
  markApprovedInput: MarkAdjustmentApprovedInput | null = null;
  markRejectedInput: MarkAdjustmentRejectedInput | null = null;
  mutatingInventoryTablesTouched = false;

  constructor(private adjustment: InventoryAdjustmentRecord | null) {
    super();
  }

  async lockAdjustmentWithLinesForUpdate(): Promise<InventoryAdjustmentWithLinesRecord | null> {
    if (this.adjustment === null) {
      return null;
    }

    return {
      adjustment: this.adjustment,
      lines: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          tenantId,
          adjustmentId,
          productId,
          adjustmentType: 'increase',
          quantityDifference: '1.000',
          finalCountedQuantity: null,
          unitCost: '100.00',
          estimatedFifoCost: '100.00',
        },
      ],
    };
  }

  async markAdjustmentPendingApproval(input: MarkAdjustmentPendingApprovalInput) {
    this.markPendingApprovalInput = input;
    this.adjustment = {
      ...this.adjustment!,
      status: INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL,
      updatedAt: input.updatedAt,
      lockVersion: this.adjustment!.lockVersion + 1,
    };
    return this.adjustment;
  }

  async markAdjustmentApproved(input: MarkAdjustmentApprovedInput) {
    this.markApprovedInput = input;
    this.adjustment = {
      ...this.adjustment!,
      status: INVENTORY_ADJUSTMENT_STATUSES.APPROVED,
      approvedByUserId: input.approvedByUserId,
      updatedAt: input.updatedAt,
      lockVersion: this.adjustment!.lockVersion + 1,
    };
    return this.adjustment;
  }

  async markAdjustmentRejected(input: MarkAdjustmentRejectedInput) {
    this.markRejectedInput = input;
    this.adjustment = {
      ...this.adjustment!,
      status: INVENTORY_ADJUSTMENT_STATUSES.REJECTED,
      updatedAt: input.updatedAt,
      lockVersion: this.adjustment!.lockVersion + 1,
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

  listProducts = vi.fn();
  findProductById = vi.fn();
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
    status: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
    reason: 'Physical count variance.',
    valueImpact: '5000.00',
    approvalRequired: true,
    requestedByUserId: userId,
    approvedByUserId: null,
    postedAt: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    lockVersion: 0,
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
