import { describe, expect, it, vi } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type { InventoryReservationReleaseCommandResult } from '../../inventory/application/inventory-reservation.service';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import type { ProductRecord } from '../../products/application/product.store';
import { ProductStore } from '../../products/application/product.store';
import type { SendInventoryTransferRequest } from '../api/inventory-transfer.schemas';
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
  type UpdateTransferLineSentQuantityInput,
  type UpdateTransferStatusInput,
  type UpdateTransferStatusToInTransitInput,
} from './inventory-transfer.store';
import { SendInventoryTransferService } from './send-inventory-transfer.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const transferId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const destinationBranchId = '44444444-4444-4444-8444-444444444444';
const lineId = '55555555-5555-4555-8555-555555555555';
const secondLineId = '55555555-5555-4555-8555-555555555556';
const productId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const reservationId = '88888888-8888-4888-8888-888888888888';

describe('SendInventoryTransferService', () => {
  it('requires inventory.transfer.send for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.sendPending(transferId, createRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.transfer.send' }],
    });
  });

  it('blocks non-pending transfers before releasing reservations', async () => {
    const fixture = createFixture({ transferStatus: 'draft' });

    await expect(
      fixture.service.sendPending(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.send']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_not_pending' })],
    });
    expect(fixture.reservationService.releaseInventoryInTransaction).not.toHaveBeenCalled();
  });

  it('rejects missing transfer lines', async () => {
    const fixture = createFixture({ lines: [createLine(), createLine({ id: secondLineId })] });

    await expect(
      fixture.service.sendPending(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.send']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'transfer_line_count_mismatch' })],
    });
  });

  it('rejects sent quantity greater than reserved quantity', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.sendPending(
        transferId,
        createRequest({ sent_quantity: '6.000' }),
        createTenantSession(['inventory.transfer.send']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'sent_quantity_exceeds_reserved' })],
    });
  });

  it('sends full reserved quantity without releasing reservations', async () => {
    const fixture = createFixture();

    const response = await fixture.service.sendPending(
      transferId,
      createRequest(),
      createTenantSession(['inventory.transfer.send']),
    );

    expect(fixture.reservationService.releaseInventoryInTransaction).not.toHaveBeenCalled();
    expect(fixture.store.sentQuantityInputs).toEqual([
      expect.objectContaining({ lineId, sentQuantity: '5.000' }),
    ]);
    expect(fixture.store.inTransitInput).toMatchObject({
      tenantId,
      transferId,
      expectedStatus: 'pending',
      sentByUserId: userId,
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'pending',
      toStatus: 'in_transit',
      createdByUserId: userId,
    });
    expect(response.transfer.status).toBe('in_transit');
    expect(response.lines).toEqual([
      {
        line_id: lineId,
        product_id: productId,
        sent_quantity: '5.000',
      },
    ]);
  });

  it('partially sends and releases unused reservation quantity', async () => {
    const fixture = createFixture();

    const response = await fixture.service.sendPending(
      transferId,
      createRequest({ sent_quantity: '3.000' }),
      createTenantSession(['inventory.transfer.send']),
    );

    expect(fixture.reservationService.releaseInventoryInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        reservationId,
        releaseQuantity: '2.000',
        transactionType: 'inventory_transfer_reservation_release',
        releasedByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(response.released_reservations).toEqual([
      {
        line_id: lineId,
        product_id: productId,
        reservation_id: reservationId,
        released_quantity: '2.000',
        ledger_entry_id: '99999999-9999-4999-8999-999999999999',
      },
    ]);
    expect(response.ledger_entry_ids).toEqual(['99999999-9999-4999-8999-999999999999']);
  });
});

function createFixture(
  options: {
    transferStatus?: InventoryTransferRecord['status'];
    lines?: readonly InventoryTransferLineRecord[];
  } = {},
) {
  const store = new FakeInventoryTransferStore(
    options.transferStatus ?? 'pending',
    options.lines ?? [createLine()],
  );
  const productStore = new FakeProductStore();
  const reservationService = {
    assertActiveReservationInTransaction: vi
      .fn()
      .mockResolvedValue(createReleaseResult().reservation),
    releaseInventoryInTransaction: vi.fn().mockResolvedValue(createReleaseResult()),
  } as unknown as InventoryReservationService & {
    assertActiveReservationInTransaction: ReturnType<typeof vi.fn>;
    releaseInventoryInTransaction: ReturnType<typeof vi.fn>;
  };
  const transactionRunner: DatabaseTransactionRunner = {
    runInTransaction: async (work) => work({} as DatabaseQueryClient),
  };

  return {
    store,
    reservationService,
    service: new SendInventoryTransferService(
      store,
      productStore,
      reservationService,
      transactionRunner,
    ),
  };
}

class FakeInventoryTransferStore extends InventoryTransferStore {
  sentQuantityInputs: UpdateTransferLineSentQuantityInput[] = [];
  inTransitInput: UpdateTransferStatusToInTransitInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(
    private readonly transferStatus: InventoryTransferRecord['status'],
    private readonly lines: readonly InventoryTransferLineRecord[],
  ) {
    super();
  }

  async lockTransferForUpdate() {
    return createTransfer(this.transferStatus);
  }

  async listTransferLinesForUpdate() {
    return this.lines;
  }

  async updateTransferLineSentQuantity(input: UpdateTransferLineSentQuantityInput) {
    this.sentQuantityInputs.push(input);

    return {
      ...this.lines.find((line) => line.id === input.lineId)!,
      sentQuantity: input.sentQuantity,
    };
  }

  async updateTransferStatusToInTransit(input: UpdateTransferStatusToInTransitInput) {
    this.inTransitInput = input;

    return {
      ...createTransfer('in_transit'),
      sentByUserId: input.sentByUserId,
      sentAt: input.sentAt,
      lockVersion: 1,
      updatedAt: input.sentAt,
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
  updateTransferLineReservation = vi.fn(
    async (input: UpdateTransferLineReservationInput): Promise<InventoryTransferLineRecord> => ({
      ...createLine({ id: input.lineId }),
      reservedQuantity: input.reservedQuantity,
      reservationId: input.reservationId,
    }),
  );
  updateTransferStatus = vi.fn(
    async (input: UpdateTransferStatusInput): Promise<InventoryTransferRecord> => ({
      ...createTransfer(input.nextStatus),
      updatedAt: input.updatedAt,
    }),
  );
  findLatestTransferNumberForDate = vi.fn(async () => 'TR-20260630-000001');
}

class FakeProductStore extends ProductStore {
  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    throw new Error('Not used by send transfer tests.');
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

function createLine(
  overrides: Partial<InventoryTransferLineRecord> = {},
): InventoryTransferLineRecord {
  return {
    id: lineId,
    tenantId,
    transferId,
    productId,
    requestedQuantity: '5.000',
    reservedQuantity: '5.000',
    sentQuantity: null,
    receivedQuantity: null,
    varianceQuantity: null,
    varianceReason: null,
    reservationId,
    ...overrides,
  };
}

function createReleaseResult(): InventoryReservationReleaseCommandResult {
  return {
    reservation: {
      id: reservationId,
      tenantId,
      branchId: sourceBranchId,
      productId,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      requestedQuantity: '5.000',
      reservedQuantity: '3.000',
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
      reserved_qty: '3.000',
      available_qty: '7.000',
      lock_version: 2,
    },
    ledgerEntry: {
      id: '99999999-9999-4999-8999-999999999999',
      tenantId,
      branchId: sourceBranchId,
      productId,
      transactionType: 'inventory_transfer_reservation_release',
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '-2.000',
      unitCost: null,
      totalCost: null,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      occurredAt: new Date('2026-06-30T00:00:00.000Z'),
      createdByUserId: userId,
    },
  };
}

function createRequest(
  line: Partial<SendInventoryTransferRequest['lines'][number]> = {},
): SendInventoryTransferRequest {
  return {
    lines: [
      {
        line_id: lineId,
        sent_quantity: '5.000',
        ...line,
      },
    ],
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
