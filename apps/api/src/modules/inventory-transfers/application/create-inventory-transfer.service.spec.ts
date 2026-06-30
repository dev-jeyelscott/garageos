import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { BranchStore, type BranchSummaryRecord } from '../../branches/application/branch.store';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import { CreateInventoryTransferService } from './create-inventory-transfer.service';
import { InventoryTransferNumberService } from './inventory-transfer-number.service';
import {
  InventoryTransferStore,
  type CreateDraftTransferInput,
  type CreateDraftTransferLinesInput,
  type InsertStatusEventInput,
} from './inventory-transfer.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const sourceBranchId = '22222222-2222-4222-8222-222222222222';
const destinationBranchId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

describe('CreateInventoryTransferService', () => {
  it('requires inventory.transfer.create for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.createDraft(createRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.transfer.create' }],
    });
  });

  it('blocks operational writes for read-only tenants', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });
  });

  it('requires access to both source and destination branches', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create'], { branchIds: [sourceBranchId] }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('creates a draft transfer with lines and status history without stock mutation', async () => {
    const fixture = createFixture();

    const response = await fixture.service.createDraft(
      createRequest(),
      createTenantSession(['inventory.transfer.create']),
    );

    expect(response.transfer).toMatchObject({
      transfer_number: 'TR-20260630-000001',
      source_branch_id: sourceBranchId,
      destination_branch_id: destinationBranchId,
      status: 'draft',
      remarks: 'Restock satellite branch.',
    });
    expect(response.lines[0]).toMatchObject({
      product_id: productId,
      requested_quantity: '5.000',
      reserved_quantity: null,
      sent_quantity: null,
      received_quantity: null,
      variance_quantity: null,
      reservation_id: null,
    });
    expect(fixture.store.createDraftTransferInput).toMatchObject({
      tenantId,
      sourceBranchId,
      destinationBranchId,
      transferNumber: 'TR-20260630-000001',
      createdByUserId: userId,
    });
    expect(fixture.store.createDraftTransferLinesInput?.lines[0]).toMatchObject({
      productId,
      requestedQuantity: '5.000',
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      tenantId,
      fromStatus: null,
      toStatus: 'draft',
      createdByUserId: userId,
    });
    expect(fixture.store.mutatingInventoryTablesTouched).toBe(false);
  });

  it('rejects inactive source branches', async () => {
    const fixture = createFixture({ inactiveBranchIds: [sourceBranchId] });

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [
        expect.objectContaining({
          field: 'source_branch_id',
          code: 'branch_not_active',
          message: 'Source branch must be active.',
        }),
      ],
    });
  });

  it('rejects inactive destination branches', async () => {
    const fixture = createFixture({ inactiveBranchIds: [destinationBranchId] });

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [
        expect.objectContaining({
          field: 'destination_branch_id',
          code: 'branch_not_active',
          message: 'Destination branch must be active.',
        }),
      ],
    });
  });

  it('returns resource_not_found when a branch is missing', async () => {
    const fixture = createFixture({ missingBranchIds: [destinationBranchId] });

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create']),
      ),
    ).rejects.toMatchObject({
      code: 'resource_not_found',
      message: 'Branch was not found.',
    });
  });

  it('rejects inactive products', async () => {
    const fixture = createFixture({ productStatus: 'inactive' });

    await expect(
      fixture.service.createDraft(
        createRequest(),
        createTenantSession(['inventory.transfer.create']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'product_not_active' })],
    });
  });
});

function createFixture(
  options: {
    productStatus?: 'active' | 'inactive';
    inactiveBranchIds?: readonly string[];
    missingBranchIds?: readonly string[];
  } = {},
) {
  const store = new FakeInventoryTransferStore();
  const productStore = new FakeProductStore(options.productStatus ?? 'active');
  const branchStore = new FakeBranchStore({
    inactiveBranchIds: options.inactiveBranchIds ?? [],
    missingBranchIds: options.missingBranchIds ?? [],
  });
  const numberService = new InventoryTransferNumberService(store);
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    service: new CreateInventoryTransferService(
      store,
      productStore,
      branchStore,
      numberService,
      transactionRunner,
    ),
  };
}

class FakeInventoryTransferStore extends InventoryTransferStore {
  createDraftTransferInput: CreateDraftTransferInput | null = null;
  createDraftTransferLinesInput: CreateDraftTransferLinesInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;
  mutatingInventoryTablesTouched = false;

  async createDraftTransfer(input: CreateDraftTransferInput) {
    this.createDraftTransferInput = input;

    return {
      ...input,
      status: 'draft' as const,
      sentByUserId: null,
      receivedByUserId: null,
      cancelledByUserId: null,
      sentAt: null,
      receivedAt: null,
      cancelledAt: null,
      cancellationDisposition: null,
      updatedAt: input.createdAt,
      lockVersion: 0,
    };
  }

  async createDraftTransferLines(input: CreateDraftTransferLinesInput) {
    this.createDraftTransferLinesInput = input;

    return input.lines.map((line) => ({
      ...line,
      tenantId: input.tenantId,
      transferId: input.transferId,
      reservedQuantity: null,
      sentQuantity: null,
      receivedQuantity: null,
      varianceQuantity: null,
      varianceReason: null,
      reservationId: null,
    }));
  }

  async insertStatusEvent(input: InsertStatusEventInput) {
    this.insertStatusEventInput = input;

    return input;
  }

  async findLatestTransferNumberForDate() {
    return 'TR-20260630-000001';
  }

  async lockTransferForUpdate() {
    return null;
  }

  async listTransferLinesForUpdate() {
    return [];
  }

  async updateTransferLineReservation(): Promise<never> {
    throw new Error('not implemented');
  }

  async updateTransferStatus() {
    return null;
  }
}

class FakeBranchStore extends BranchStore {
  constructor(
    private readonly options: {
      inactiveBranchIds: readonly string[];
      missingBranchIds: readonly string[];
    },
  ) {
    super();
  }

  async findBranchById(_tenantId: string, branchId: string): Promise<BranchSummaryRecord | null> {
    if (this.options.missingBranchIds.includes(branchId)) {
      return null;
    }

    return {
      id: branchId,
      name: branchId === sourceBranchId ? 'Main Branch' : 'Satellite Branch',
      address: '123 Shop Street',
      contactNumber: '+639171234567',
      businessHoursJson: {},
      status: this.options.inactiveBranchIds.includes(branchId) ? 'inactive' : 'active',
      lockVersion: 0,
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedAt: new Date('2026-06-30T00:00:00.000Z'),
      deactivatedAt: null,
      reactivatedAt: null,
    };
  }

  isActiveShopOwner = vi.fn();
  countActiveBranches = vi.fn();
  getEffectiveMaxActiveBranches = vi.fn();
  createBranch = vi.fn();
  listBranches = vi.fn();
  updateBranch = vi.fn();
  changeBranchStatus = vi.fn();
  createBranchStatusEvent = vi.fn();
  findBranchDeactivationBlockers = vi.fn();
}

class FakeProductStore extends ProductStore {
  constructor(private readonly productStatus: 'active' | 'inactive') {
    super();
  }

  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    return {
      id: productId,
      tenantId,
      categoryId: '66666666-6666-4666-8666-666666666666',
      category: {
        id: '66666666-6666-4666-8666-666666666666',
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
      status: this.productStatus,
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

function createRequest() {
  return {
    source_branch_id: sourceBranchId,
    destination_branch_id: destinationBranchId,
    remarks: 'Restock satellite branch.',
    lines: [
      {
        product_id: productId,
        requested_quantity: '5.000',
      },
    ],
  };
}

function createTenantSession(
  permissions: readonly string[],
  options: {
    tenantStatus?: TenantStatus;
    branchIds?: readonly string[];
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
      status: options.tenantStatus ?? 'active',
    },
    effective_permissions: permissions,
    branches: (options.branchIds ?? [sourceBranchId, destinationBranchId]).map((id) => ({ id })),
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}
