import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { BranchStore, type BranchSummaryRecord } from '../../branches/application/branch.store';
import type { InventoryReservationCommandResult } from '../../inventory/application/inventory-reservation.service';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import type { ProductRecord } from '../../products/application/product.store';
import { ProductStore } from '../../products/application/product.store';
import type {
  InventoryTransferLineRecord,
  InventoryTransferRecord,
  InventoryTransferStatusEventRecord,
} from './inventory-transfer.records';
import {
  InventoryTransferStore,
  type CreateDraftTransferInput,
  type CreateDraftTransferLinesInput,
  type InsertStatusEventInput,
  type UpdateTransferLineReservationInput,
  type UpdateTransferStatusInput,
} from './inventory-transfer.store';
import { SubmitInventoryTransferService } from './submit-inventory-transfer.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const transferId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const destinationBranchId = '44444444-4444-4444-8444-444444444444';
const lineId = '55555555-5555-4555-8555-555555555555';
const productId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';

describe('SubmitInventoryTransferService', () => {
  it('requires inventory.transfer.create for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.submitDraft(transferId, createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.transfer.create' }],
    });
  });

  it('blocks non-draft transfers before reserving stock', async () => {
    const fixture = createFixture({ transferStatus: 'pending' });

    await expect(
      fixture.service.submitDraft(transferId, createTenantSession(['inventory.transfer.create'])),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_not_draft' })],
    });
    expect(fixture.reservationService.reserveInventoryInTransaction).not.toHaveBeenCalled();
  });

  it('reserves source stock and updates transfer status to pending', async () => {
    const fixture = createFixture();

    const response = await fixture.service.submitDraft(
      transferId,
      createTenantSession(['inventory.transfer.create']),
    );

    expect(fixture.reservationService.reserveInventoryInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        branchId: sourceBranchId,
        productId,
        sourceType: 'inventory_transfer_line',
        sourceId: lineId,
        requestedQuantity: '5.000',
        transactionType: 'inventory_transfer_reservation',
        createdByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(fixture.store.updateLineReservationInput).toMatchObject({
      tenantId,
      lineId,
      reservedQuantity: '5.000',
      reservationId: '88888888-8888-4888-8888-888888888888',
    });
    expect(fixture.store.updateStatusInput).toMatchObject({
      tenantId,
      transferId,
      expectedStatus: 'draft',
      nextStatus: 'pending',
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'pending',
      createdByUserId: userId,
    });
    expect(response.transfer.status).toBe('pending');
    expect(response.reservations[0]).toMatchObject({
      line_id: lineId,
      product_id: productId,
      reservation_id: '88888888-8888-4888-8888-888888888888',
      reserved_quantity: '5.000',
      ledger_entry_id: '99999999-9999-4999-8999-999999999999',
    });
  });
});

function createFixture(
  options: {
    transferStatus?: InventoryTransferRecord['status'];
    tenantStatus?: TenantStatus;
  } = {},
) {
  const store = new FakeInventoryTransferStore(options.transferStatus ?? 'draft');
  const productStore = new FakeProductStore();
  const branchStore = new FakeBranchStore();
  const reservationService = {
    reserveInventoryInTransaction: vi.fn().mockResolvedValue(createReservationResult()),
  } as unknown as InventoryReservationService & {
    reserveInventoryInTransaction: ReturnType<typeof vi.fn>;
  };
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    reservationService,
    service: new SubmitInventoryTransferService(
      store,
      productStore,
      branchStore,
      reservationService,
      transactionRunner,
    ),
  };
}

class FakeInventoryTransferStore extends InventoryTransferStore {
  updateLineReservationInput: UpdateTransferLineReservationInput | null = null;
  updateStatusInput: UpdateTransferStatusInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(private readonly transferStatus: InventoryTransferRecord['status']) {
    super();
  }

  async lockTransferForUpdate() {
    return createTransfer(this.transferStatus);
  }

  async listTransferLinesForUpdate() {
    return [createLine()];
  }

  async updateTransferLineReservation(input: UpdateTransferLineReservationInput) {
    this.updateLineReservationInput = input;

    return {
      ...createLine(),
      reservedQuantity: input.reservedQuantity,
      reservationId: input.reservationId,
    };
  }

  async updateTransferStatus(input: UpdateTransferStatusInput) {
    this.updateStatusInput = input;

    return {
      ...createTransfer(input.nextStatus),
      lockVersion: 1,
      updatedAt: input.updatedAt,
    };
  }

  async insertStatusEvent(
    input: InsertStatusEventInput,
  ): Promise<InventoryTransferStatusEventRecord> {
    this.insertStatusEventInput = input;

    return input;
  }

  createDraftTransfer = vi.fn(
    async (input: CreateDraftTransferInput): Promise<InventoryTransferRecord> => ({
      ...createTransfer('draft'),
      ...input,
    }),
  );
  createDraftTransferLines = vi.fn(
    async (
      _input: CreateDraftTransferLinesInput,
    ): Promise<readonly InventoryTransferLineRecord[]> => [],
  );
  findLatestTransferNumberForDate = vi.fn(async () => 'TR-20260630-000001');
}

class FakeBranchStore extends BranchStore {
  async findBranchById(_tenantId: string, branchId: string): Promise<BranchSummaryRecord | null> {
    return {
      id: branchId,
      name: 'Branch',
      address: '123 Shop Street',
      contactNumber: '+639171234567',
      businessHoursJson: {},
      status: 'active',
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
  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    return {
      id: productId,
      tenantId,
      categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      category: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

function createTransfer(status: InventoryTransferRecord['status']): InventoryTransferRecord {
  return {
    id: transferId,
    tenantId,
    transferNumber: 'TR-20260630-000001',
    sourceBranchId,
    destinationBranchId,
    status,
    createdByUserId: userId,
    sentByUserId: null,
    receivedByUserId: null,
    cancelledByUserId: null,
    sentAt: null,
    receivedAt: null,
    cancelledAt: null,
    cancellationDisposition: null,
    remarks: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    lockVersion: 0,
  };
}

function createLine(): InventoryTransferLineRecord {
  return {
    id: lineId,
    tenantId,
    transferId,
    productId,
    requestedQuantity: '5.000',
    reservedQuantity: null,
    sentQuantity: null,
    receivedQuantity: null,
    varianceQuantity: null,
    varianceReason: null,
    reservationId: null,
  };
}

function createReservationResult(): InventoryReservationCommandResult {
  return {
    reservation: {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId,
      branchId: sourceBranchId,
      productId,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      requestedQuantity: '5.000',
      reservedQuantity: '5.000',
      status: 'active',
      reservedAt: new Date('2026-06-30T00:00:00.000Z'),
      releasedAt: null,
      consumedAt: null,
    },
    fifoAllocations: [],
    stockAvailability: {
      tenant_id: tenantId,
      branch_id: sourceBranchId,
      product_id: productId,
      on_hand_qty: '10.000',
      reserved_qty: '5.000',
      available_qty: '5.000',
      lock_version: 1,
    },
    ledgerEntry: {
      id: '99999999-9999-4999-8999-999999999999',
      tenantId,
      branchId: sourceBranchId,
      productId,
      transactionType: 'inventory_transfer_reservation',
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '5.000',
      unitCost: null,
      totalCost: null,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      occurredAt: new Date('2026-06-30T00:00:00.000Z'),
      createdByUserId: userId,
    },
  };
}

function createTenantSession(
  permissions: readonly string[],
  options: {
    tenantStatus?: TenantStatus;
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
    branches: [{ id: sourceBranchId }, { id: destinationBranchId }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}
