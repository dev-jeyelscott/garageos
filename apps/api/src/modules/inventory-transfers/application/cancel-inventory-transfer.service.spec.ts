import { describe, expect, it, vi } from 'vitest';

import type { RecordAuditLogInput } from '../../../shared/audit/audit.service';
import { AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type {
  InventoryReservationReleaseCommandResult,
  InventoryTransferReservationConsumptionCommandResult,
} from '../../inventory/application/inventory-reservation.service';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import type { ProductRecord } from '../../products/application/product.store';
import { ProductStore } from '../../products/application/product.store';
import { CancelInventoryTransferService } from './cancel-inventory-transfer.service';
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
  type UpdateTransferLineReceivedQuantityInput,
  type UpdateTransferLineReservationInput,
  type UpdateTransferLineSentQuantityInput,
  type UpdateTransferStatusInput,
  type UpdateTransferStatusToCancelledInput,
  type UpdateTransferStatusToInTransitInput,
  type UpdateTransferStatusToReceivedInput,
} from './inventory-transfer.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const transferId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const destinationBranchId = '44444444-4444-4444-8444-444444444444';
const lineId = '55555555-5555-4555-8555-555555555555';
const productId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const reservationId = '88888888-8888-4888-8888-888888888888';

describe('CancelInventoryTransferService', () => {
  it('requires inventory.transfer.cancel for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.cancelTransfer(transferId, createCancelRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.transfer.cancel' }],
    });
  });

  it('blocks read-only tenants before opening a transaction', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });

    expect(fixture.transactionRunner.runCount).toBe(0);
    expectNoCancelMutation(fixture);
  });

  it('blocks missing source branch access before mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel'], {
          branches: [{ id: destinationBranchId }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expectNoCancelMutation(fixture);
  });

  it('blocks missing destination branch access before mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel'], {
          branches: [{ id: sourceBranchId }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expectNoCancelMutation(fixture);
  });

  it.each(['draft', 'pending', 'in_transit'] as const)(
    'requires cancellation reason for %s transfers before mutation',
    async (status) => {
      const fixture = createFixture({
        transferStatus: status,
        ...(status === 'draft' ? { lines: [createLineDraft()] } : {}),
      });
      const request =
        status === 'in_transit'
          ? ({
              disposition: 'returned_to_source',
            } as Parameters<CancelInventoryTransferService['cancelTransfer']>[1])
          : ({} as Parameters<CancelInventoryTransferService['cancelTransfer']>[1]);

      await expect(
        fixture.service.cancelTransfer(
          transferId,
          request,
          createTenantSession(['inventory.transfer.cancel']),
        ),
      ).rejects.toMatchObject({
        code: 'validation_failed',
        details: [expect.objectContaining({ code: 'cancellation_reason_required' })],
      });

      expect(fixture.transactionRunner.runCount).toBe(0);
      expectNoCancelMutation(fixture);
    },
  );

  it.each(['draft', 'pending'] as const)(
    'rejects disposition for %s transfer cancellation',
    async (status) => {
      const fixture = createFixture({
        transferStatus: status,
        ...(status === 'draft' ? { lines: [createLineDraft()] } : {}),
      });

      await expect(
        fixture.service.cancelTransfer(
          transferId,
          createCancelRequest({ disposition: 'returned_to_source' }),
          createTenantSession(['inventory.transfer.cancel']),
        ),
      ).rejects.toMatchObject({
        code: 'validation_failed',
        details: [expect.objectContaining({ code: 'disposition_not_allowed' })],
      });

      expectNoCancelMutation(fixture);
    },
  );

  it('cancels draft transfers without inventory effects', async () => {
    const fixture = createFixture({ transferStatus: 'draft', lines: [createLineDraft()] });

    const response = await fixture.service.cancelTransfer(
      transferId,
      createCancelRequest(),
      createTenantSession(['inventory.transfer.cancel']),
    );

    expect(fixture.reservationService.releaseInventoryInTransaction).not.toHaveBeenCalled();
    expect(
      fixture.reservationService.consumeInventoryTransferReservationInTransaction,
    ).not.toHaveBeenCalled();
    expect(fixture.store.cancelledStatusInput).toMatchObject({
      expectedStatus: 'draft',
      cancellationDisposition: null,
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'cancelled',
    });
    expect(response.inventory_effects).toMatchObject({
      ledger_entry_ids: [],
      disposition: null,
      variance_loss_amount: '0.00',
    });
  });

  it('cancels pending transfers by releasing reservations and FIFO allocations', async () => {
    const fixture = createFixture({ transferStatus: 'pending' });

    const response = await fixture.service.cancelTransfer(
      transferId,
      createCancelRequest(),
      createTenantSession(['inventory.transfer.cancel']),
    );

    expect(fixture.reservationService.releaseInventoryInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        reservationId,
        releaseQuantity: '5.000',
        transactionType: 'inventory_transfer_reservation_release',
        expectedBranchId: sourceBranchId,
        expectedProductId: productId,
        expectedSourceType: 'inventory_transfer_line',
        expectedSourceId: lineId,
        expectedReservedQuantity: '5.000',
        releasedByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(fixture.store.cancelledStatusInput).toMatchObject({ expectedStatus: 'pending' });
    expect(response.inventory_effects.ledger_entry_ids).toEqual(['release-ledger-entry-id']);
  });

  it('requires disposition for in-transit cancellation', async () => {
    const fixture = createFixture({ transferStatus: 'in_transit' });

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'disposition_required' })],
    });

    expectNoCancelMutation(fixture);
  });

  it('cancels in-transit returned-to-source transfers by releasing reservations only', async () => {
    const fixture = createFixture({ transferStatus: 'in_transit' });

    const response = await fixture.service.cancelTransfer(
      transferId,
      createCancelRequest({ disposition: 'returned_to_source' }),
      createTenantSession(['inventory.transfer.cancel']),
    );

    expect(fixture.reservationService.releaseInventoryInTransaction).toHaveBeenCalledOnce();
    expect(fixture.reservationService.releaseInventoryInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        reservationId,
        releaseQuantity: '5.000',
        transactionType: 'inventory_transfer_reservation_release',
        expectedBranchId: sourceBranchId,
        expectedProductId: productId,
        expectedSourceType: 'inventory_transfer_line',
        expectedSourceId: lineId,
        expectedReservedQuantity: '5.000',
        releasedByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(
      fixture.reservationService.consumeInventoryTransferReservationInTransaction,
    ).not.toHaveBeenCalled();
    expect(response.inventory_effects).toMatchObject({
      disposition: 'returned_to_source',
      variance_loss_amount: '0.00',
    });
  });

  it('requires reason for in-transit lost-or-damaged cancellation', async () => {
    const fixture = createFixture({ transferStatus: 'in_transit' });

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        { disposition: 'lost_or_damaged' } as Parameters<
          CancelInventoryTransferService['cancelTransfer']
        >[1],
        createTenantSession(['inventory.transfer.cancel']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'cancellation_reason_required' })],
    });

    expect(fixture.transactionRunner.runCount).toBe(0);
    expectNoCancelMutation(fixture);
  });

  it('cancels in-transit lost-or-damaged transfers by consuming FIFO and recording variance loss', async () => {
    const fixture = createFixture({ transferStatus: 'in_transit' });

    const response = await fixture.service.cancelTransfer(
      transferId,
      createCancelRequest({ disposition: 'lost_or_damaged', reason: 'Destroyed during transit.' }),
      createTenantSession(['inventory.transfer.cancel']),
    );

    expect(
      fixture.reservationService.consumeInventoryTransferReservationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        reservationId,
        receivedQuantity: '0.000',
        expectedSentQuantity: '5.000',
        expectedBranchId: sourceBranchId,
        expectedProductId: productId,
        expectedSourceType: 'inventory_transfer_line',
        expectedSourceId: lineId,
        consumedByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(fixture.store.receivedLineInputs).toEqual([
      expect.objectContaining({
        receivedQuantity: '0.000',
        varianceQuantity: '5.000',
        varianceReason: 'Destroyed during transit.',
      }),
    ]);
    expect(response.inventory_effects).toMatchObject({
      disposition: 'lost_or_damaged',
      variance_loss_amount: '50.00',
    });
    expect(response.inventory_effects.ledger_entry_ids).toEqual(['variance-ledger-entry-id']);
  });

  it.each(['received', 'cancelled'] as const)(
    'rejects %s transfer cancellation',
    async (status) => {
      const fixture = createFixture({ transferStatus: status });

      await expect(
        fixture.service.cancelTransfer(
          transferId,
          createCancelRequest(),
          createTenantSession(['inventory.transfer.cancel']),
        ),
      ).rejects.toMatchObject({
        code: 'workflow_transition_blocked',
        details: [expect.objectContaining({ code: 'transfer_not_cancellable' })],
      });

      expectNoCancelMutation(fixture);
    },
  );

  it('does not write audit or status event when status update conflicts', async () => {
    const fixture = createFixture({ cancelledResult: null });

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_status_conflict' })],
    });

    expect(fixture.store.insertStatusEventInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });

  it('does not mark transfer cancelled when reservation release context validation fails', async () => {
    const fixture = createFixture({ transferStatus: 'pending' });
    fixture.reservationService.releaseInventoryInTransaction.mockRejectedValueOnce({
      code: 'workflow_transition_blocked',
      details: [{ code: 'transfer_reservation_mismatch' }],
    });

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest(),
        createTenantSession(['inventory.transfer.cancel']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_reservation_mismatch' })],
    });

    expect(fixture.store.cancelledStatusInput).toBeNull();
    expect(fixture.store.insertStatusEventInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });

  it('does not mark transfer cancelled when reservation consumption fails', async () => {
    const fixture = createFixture({ transferStatus: 'in_transit' });
    fixture.reservationService.consumeInventoryTransferReservationInTransaction.mockRejectedValueOnce(
      {
        code: 'fifo_allocation_conflict',
      },
    );

    await expect(
      fixture.service.cancelTransfer(
        transferId,
        createCancelRequest({
          disposition: 'lost_or_damaged',
          reason: 'Destroyed during transit.',
        }),
        createTenantSession(['inventory.transfer.cancel']),
      ),
    ).rejects.toMatchObject({ code: 'fifo_allocation_conflict' });

    expect(fixture.store.cancelledStatusInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });
});

function createCancelRequest(
  overrides: Partial<Parameters<CancelInventoryTransferService['cancelTransfer']>[1]> = {},
): Parameters<CancelInventoryTransferService['cancelTransfer']>[1] {
  return {
    reason: 'Transfer cancelled by request.',
    ...overrides,
  } as Parameters<CancelInventoryTransferService['cancelTransfer']>[1];
}

function createFixture(
  options: {
    transferStatus?: InventoryTransferRecord['status'];
    lines?: readonly InventoryTransferLineRecord[];
    cancelledResult?: InventoryTransferRecord | null;
  } = {},
) {
  const store = new FakeInventoryTransferStore(
    options.transferStatus ?? 'pending',
    options.lines ?? [createLine()],
    options.cancelledResult,
  );
  const productStore = new FakeProductStore();
  const reservationService = {
    releaseInventoryInTransaction: vi.fn().mockResolvedValue(createReleaseResult()),
    consumeInventoryTransferReservationInTransaction: vi
      .fn()
      .mockResolvedValue(createConsumptionResult()),
  } as unknown as InventoryReservationService & {
    releaseInventoryInTransaction: ReturnType<typeof vi.fn>;
    consumeInventoryTransferReservationInTransaction: ReturnType<typeof vi.fn>;
  };
  const transactionClient = {} as DatabaseQueryClient;
  const trackedTransactionRunner = {
    runCount: 0,
    transactionClient,
    runInTransaction: async (work) => {
      trackedTransactionRunner.runCount += 1;

      return work(transactionClient);
    },
  } satisfies DatabaseTransactionRunner & {
    runCount: number;
    transactionClient: DatabaseQueryClient;
  };
  const auditService = {
    record: vi.fn(async (input: RecordAuditLogInput) => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: input.tenantId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      supportAccessSessionId: input.supportAccessSessionId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      branchId: input.branchId ?? null,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      metadataJson: input.metadataJson ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      retentionClass: input.retentionClass ?? 'standard_3_year',
      createdAt: input.createdAt ?? new Date(),
    })),
  } as unknown as AuditService & { record: ReturnType<typeof vi.fn> };

  return {
    store,
    reservationService,
    transactionRunner: trackedTransactionRunner,
    auditService,
    service: new CancelInventoryTransferService(
      store,
      productStore,
      reservationService,
      trackedTransactionRunner,
      auditService,
    ),
  };
}

function expectNoCancelMutation(fixture: ReturnType<typeof createFixture>): void {
  expect(fixture.reservationService.releaseInventoryInTransaction).not.toHaveBeenCalled();
  expect(
    fixture.reservationService.consumeInventoryTransferReservationInTransaction,
  ).not.toHaveBeenCalled();
  expect(fixture.store.cancelledStatusInput).toBeNull();
  expect(fixture.store.insertStatusEventInput).toBeNull();
  expect(fixture.auditService.record).not.toHaveBeenCalled();
}

class FakeInventoryTransferStore extends InventoryTransferStore {
  receivedLineInputs: UpdateTransferLineReceivedQuantityInput[] = [];
  cancelledStatusInput: UpdateTransferStatusToCancelledInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(
    private readonly transferStatus: InventoryTransferRecord['status'],
    private readonly lines: readonly InventoryTransferLineRecord[],
    private readonly cancelledResult: InventoryTransferRecord | null | undefined,
  ) {
    super();
  }

  async lockTransferForUpdate() {
    return createTransfer(this.transferStatus);
  }

  async listTransferLinesForUpdate() {
    return this.lines;
  }

  async updateTransferLineReceivedQuantity(input: UpdateTransferLineReceivedQuantityInput) {
    this.receivedLineInputs.push(input);

    return {
      ...this.lines.find((line) => line.id === input.lineId)!,
      receivedQuantity: input.receivedQuantity,
      varianceQuantity: input.varianceQuantity,
      varianceReason: input.varianceReason,
    };
  }

  async updateTransferStatusToCancelled(input: UpdateTransferStatusToCancelledInput) {
    this.cancelledStatusInput = input;

    if (this.cancelledResult !== undefined) {
      return this.cancelledResult;
    }

    return {
      ...createTransfer('cancelled'),
      cancelledByUserId: input.cancelledByUserId,
      cancelledAt: input.cancelledAt,
      cancellationDisposition: input.cancellationDisposition,
      updatedAt: input.cancelledAt,
      lockVersion: 2,
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
  updateTransferLineSentQuantity = vi.fn(
    async (input: UpdateTransferLineSentQuantityInput): Promise<InventoryTransferLineRecord> => ({
      ...createLine({ id: input.lineId }),
      sentQuantity: input.sentQuantity,
    }),
  );
  updateTransferStatusToInTransit = vi.fn(
    async (input: UpdateTransferStatusToInTransitInput): Promise<InventoryTransferRecord> => ({
      ...createTransfer('in_transit'),
      sentByUserId: input.sentByUserId,
      sentAt: input.sentAt,
    }),
  );
  updateTransferStatusToReceived = vi.fn(
    async (input: UpdateTransferStatusToReceivedInput): Promise<InventoryTransferRecord> => ({
      ...createTransfer('received'),
      receivedByUserId: input.receivedByUserId,
      receivedAt: input.receivedAt,
    }),
  );
  findLatestTransferNumberForDate = vi.fn(async () => 'TR-20260630-000001');
}

class FakeProductStore extends ProductStore {
  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    throw new Error('Not used by cancel transfer tests.');
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
    sentByUserId: status === 'in_transit' ? userId : null,
    receivedByUserId: null,
    cancelledByUserId: null,
    sentAt: status === 'in_transit' ? new Date('2026-06-30T00:00:00.000Z') : null,
    receivedAt: status === 'received' ? new Date('2026-06-30T01:00:00.000Z') : null,
    cancelledAt: status === 'cancelled' ? new Date('2026-06-30T01:00:00.000Z') : null,
    cancellationDisposition: null,
    remarks: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    lockVersion: 1,
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
    sentQuantity: '5.000',
    receivedQuantity: null,
    varianceQuantity: null,
    varianceReason: null,
    reservationId,
    ...overrides,
  };
}

function createLineDraft(): InventoryTransferLineRecord {
  return createLine({
    reservedQuantity: null,
    sentQuantity: null,
    reservationId: null,
  });
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
      reservedQuantity: '5.000',
      status: 'released',
      reservedAt: new Date('2026-06-30T00:00:00.000Z'),
      releasedAt: new Date('2026-06-30T01:00:00.000Z'),
      consumedAt: null,
    },
    fifoAllocations: [],
    stockAvailability: {
      tenant_id: tenantId,
      branch_id: sourceBranchId,
      product_id: productId,
      on_hand_qty: '10.000',
      reserved_qty: '0.000',
      available_qty: '10.000',
      lock_version: 2,
    },
    ledgerEntry: {
      id: 'release-ledger-entry-id',
      tenantId,
      branchId: sourceBranchId,
      productId,
      transactionType: 'inventory_transfer_reservation_release',
      quantityDeltaOnHand: '0.000',
      quantityDeltaReserved: '-5.000',
      unitCost: null,
      totalCost: null,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      occurredAt: new Date('2026-06-30T01:00:00.000Z'),
      createdByUserId: userId,
    },
  };
}

function createConsumptionResult(): InventoryTransferReservationConsumptionCommandResult {
  return {
    reservation: {
      id: reservationId,
      tenantId,
      branchId: sourceBranchId,
      productId,
      sourceType: 'inventory_transfer_line',
      sourceId: lineId,
      requestedQuantity: '5.000',
      reservedQuantity: '5.000',
      status: 'consumed',
      reservedAt: new Date('2026-06-30T00:00:00.000Z'),
      releasedAt: null,
      consumedAt: new Date('2026-06-30T01:00:00.000Z'),
    },
    fifoAllocations: [],
    fifoConsumptions: [],
    stockAvailability: {
      tenant_id: tenantId,
      branch_id: sourceBranchId,
      product_id: productId,
      on_hand_qty: '5.000',
      reserved_qty: '0.000',
      available_qty: '5.000',
      lock_version: 2,
    },
    ledgerEntries: [
      {
        id: 'variance-ledger-entry-id',
        tenantId,
        branchId: sourceBranchId,
        productId,
        transactionType: 'inventory_transfer_variance_loss',
        quantityDeltaOnHand: '-5.000',
        quantityDeltaReserved: '-5.000',
        unitCost: null,
        totalCost: '50.00',
        sourceType: 'inventory_transfer_line',
        sourceId: lineId,
        occurredAt: new Date('2026-06-30T01:00:00.000Z'),
        createdByUserId: userId,
      },
    ],
    transferOutCost: '0.00',
    varianceLossCost: '50.00',
    sentQuantity: '5.000',
    receivedQuantity: '0.000',
    varianceQuantity: '5.000',
  };
}

function createTenantSession(
  permissions: readonly string[],
  options: {
    tenantStatus?: TenantStatus;
    branches?: readonly { readonly id: string }[];
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
    branches: options.branches ?? [{ id: sourceBranchId }, { id: destinationBranchId }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}
