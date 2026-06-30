import { describe, expect, it, vi } from 'vitest';

import type { RecordAuditLogInput } from '../../../shared/audit/audit.service';
import { AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import type { InventoryLedgerEntryRecord } from '../../inventory/application/inventory-ledger.store';
import type { InventoryTransferReservationConsumptionCommandResult } from '../../inventory/application/inventory-reservation.service';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import type { ProductRecord } from '../../products/application/product.store';
import { ProductStore } from '../../products/application/product.store';
import type { ReceiveInventoryTransferRequest } from '../api/inventory-transfer.schemas';
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
  type UpdateTransferStatusToInTransitInput,
  type UpdateTransferStatusToReceivedInput,
} from './inventory-transfer.store';
import { ReceiveInventoryTransferService } from './receive-inventory-transfer.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const transferId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const destinationBranchId = '44444444-4444-4444-8444-444444444444';
const lineId = '55555555-5555-4555-8555-555555555555';
const secondLineId = '55555555-5555-4555-8555-555555555556';
const productId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const reservationId = '88888888-8888-4888-8888-888888888888';
const sourceLayerId = '99999999-9999-4999-8999-999999999999';

describe('ReceiveInventoryTransferService', () => {
  it('requires inventory.transfer.receive for tenant users', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(transferId, createRequest(), createTenantSession([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'inventory.transfer.receive' }],
    });
  });

  it('blocks read-only tenants before opening a transaction', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });

    expect(fixture.transactionRunner.runCount).toBe(0);
    expectNoReceiveMutation(fixture);
  });

  it('blocks non-in-transit transfers before inventory mutation', async () => {
    const fixture = createFixture({ transferStatus: 'pending' });

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_not_in_transit' })],
    });

    expectNoReceiveMutation(fixture);
  });

  it('blocks missing source branch access before inventory mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive'], {
          branches: [{ id: destinationBranchId }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expectNoReceiveMutation(fixture);
  });

  it('blocks missing destination branch access before inventory mutation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive'], {
          branches: [{ id: sourceBranchId }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expectNoReceiveMutation(fixture);
  });

  it('rejects missing transfer lines', async () => {
    const fixture = createFixture({ lines: [createLine(), createLine({ id: secondLineId })] });

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'transfer_line_count_mismatch' })],
    });
  });

  it('rejects received quantity greater than sent quantity', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest({ received_quantity: '6.000' }),
        createTenantSession(['inventory.transfer.receive']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'received_quantity_exceeds_sent' })],
    });
  });

  it('requires variance reason for under-receive', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest({ received_quantity: '3.000' }),
        createTenantSession(['inventory.transfer.receive']),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [expect.objectContaining({ code: 'variance_reason_required' })],
    });
  });

  it('fully receives a transfer, creates destination stock/FIFO/ledger effects, status event, and audit', async () => {
    const fixture = createFixture();

    const response = await fixture.service.receiveInTransit(
      transferId,
      createRequest(),
      createTenantSession(['inventory.transfer.receive']),
    );

    expect(
      fixture.reservationService.consumeInventoryTransferReservationInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        reservationId,
        receivedQuantity: '5.000',
        expectedSentQuantity: '5.000',
        expectedBranchId: sourceBranchId,
        expectedProductId: productId,
        expectedSourceType: 'inventory_transfer_line',
        expectedSourceId: lineId,
        consumedByUserId: userId,
      }),
      expect.any(Object),
    );
    expect(fixture.stockService.incrementOnHandStock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        branchId: destinationBranchId,
        productId,
        quantityReceived: '5.000',
      }),
      expect.any(Object),
    );
    expect(fixture.fifoLayerService.createLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: destinationBranchId,
        productId,
        quantityReceived: '5.000',
        unitCost: '10.00',
        sourceTransactionType: 'inventory_transfer_in',
        sourceTransactionId: lineId,
        originalSourceLayerId: sourceLayerId,
      }),
      expect.any(Object),
    );
    expect(fixture.ledgerService.recordLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: destinationBranchId,
        transactionType: 'inventory_transfer_in',
        quantityDeltaOnHand: '5.000',
        quantityDeltaReserved: '0.000',
        totalCost: '50.00',
      }),
      expect.any(Object),
    );
    expect(fixture.store.receivedLineInputs).toEqual([
      expect.objectContaining({
        lineId,
        receivedQuantity: '5.000',
        varianceQuantity: '0.000',
        varianceReason: null,
      }),
    ]);
    expect(fixture.store.receivedStatusInput).toMatchObject({
      tenantId,
      transferId,
      expectedStatus: 'in_transit',
      receivedByUserId: userId,
    });
    expect(fixture.store.insertStatusEventInput).toMatchObject({
      fromStatus: 'in_transit',
      toStatus: 'received',
      createdByUserId: userId,
    });
    expect(fixture.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inventory_transfers.received',
        entityId: transferId,
        branchId: destinationBranchId,
        beforeJson: expect.objectContaining({ status: 'in_transit' }),
        afterJson: expect.objectContaining({ status: 'received' }),
        client: fixture.transactionRunner.transactionClient,
      }),
    );
    expect(response).toMatchObject({
      transfer: {
        id: transferId,
        status: 'received',
      },
      inventory_effects: {
        source_branch_id: sourceBranchId,
        destination_branch_id: destinationBranchId,
        variance_loss_amount: '0.00',
      },
    });
    expect(response.inventory_effects.ledger_entry_ids).toEqual([
      'destination-ledger-entry-id',
      'source-transfer-out-ledger-entry-id',
    ]);
  });

  it('records variance loss without destination stock for the missing quantity', async () => {
    const fixture = createFixture({
      consumptionResult: createConsumptionResult({
        receivedQuantity: '3.000',
        varianceQuantity: '2.000',
        transferOutCost: '30.00',
        varianceLossCost: '20.00',
        ledgerEntries: [
          createLedgerEntry({
            id: 'source-transfer-out-ledger-entry-id',
            transactionType: 'inventory_transfer_out',
            quantityDeltaOnHand: '-3.000',
            quantityDeltaReserved: '-3.000',
            totalCost: '30.00',
          }),
          createLedgerEntry({
            id: 'source-variance-ledger-entry-id',
            transactionType: 'inventory_transfer_variance_loss',
            quantityDeltaOnHand: '-2.000',
            quantityDeltaReserved: '-2.000',
            totalCost: '20.00',
          }),
        ],
      }),
    });

    const response = await fixture.service.receiveInTransit(
      transferId,
      createRequest({
        received_quantity: '3.000',
        variance_reason: 'Two units damaged in transit.',
      }),
      createTenantSession(['inventory.transfer.receive']),
    );

    expect(fixture.stockService.incrementOnHandStock).toHaveBeenCalledWith(
      expect.objectContaining({ quantityReceived: '3.000' }),
      expect.any(Object),
    );
    expect(fixture.fifoLayerService.createLayer).toHaveBeenCalledWith(
      expect.objectContaining({ quantityReceived: '3.000' }),
      expect.any(Object),
    );
    expect(fixture.store.receivedLineInputs).toEqual([
      expect.objectContaining({
        receivedQuantity: '3.000',
        varianceQuantity: '2.000',
        varianceReason: 'Two units damaged in transit.',
      }),
    ]);
    expect(response.inventory_effects.variance_loss_amount).toBe('20.00');
    expect(response.inventory_effects.ledger_entry_ids).toContain(
      'source-variance-ledger-entry-id',
    );
  });

  it('does not write status event or audit when final status update conflicts', async () => {
    const fixture = createFixture({ receivedResult: null });

    await expect(
      fixture.service.receiveInTransit(
        transferId,
        createRequest(),
        createTenantSession(['inventory.transfer.receive']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [expect.objectContaining({ code: 'transfer_status_conflict' })],
    });

    expect(fixture.store.insertStatusEventInput).toBeNull();
    expect(fixture.auditService.record).not.toHaveBeenCalled();
  });
});

function createFixture(
  options: {
    transferStatus?: InventoryTransferRecord['status'];
    lines?: readonly InventoryTransferLineRecord[];
    receivedResult?: InventoryTransferRecord | null;
    consumptionResult?: InventoryTransferReservationConsumptionCommandResult;
  } = {},
) {
  const store = new FakeInventoryTransferStore(
    options.transferStatus ?? 'in_transit',
    options.lines ?? [createLine()],
    options.receivedResult,
  );
  const productStore = new FakeProductStore();
  const reservationService = {
    consumeInventoryTransferReservationInTransaction: vi
      .fn()
      .mockResolvedValue(options.consumptionResult ?? createConsumptionResult()),
  } as unknown as InventoryReservationService & {
    consumeInventoryTransferReservationInTransaction: ReturnType<typeof vi.fn>;
  };
  const stockService = {
    incrementOnHandStock: vi.fn().mockResolvedValue({
      tenant_id: tenantId,
      branch_id: destinationBranchId,
      product_id: productId,
      on_hand_qty: '5.000',
      reserved_qty: '0.000',
      available_qty: '5.000',
      lock_version: 1,
    }),
  } as unknown as InventoryStockBalancesService & {
    incrementOnHandStock: ReturnType<typeof vi.fn>;
  };
  const fifoLayerService = {
    createLayer: vi.fn().mockResolvedValue({ id: 'destination-fifo-layer-id' }),
  } as unknown as FifoLayerService & { createLayer: ReturnType<typeof vi.fn> };
  const ledgerService = {
    recordLedgerEntry: vi.fn().mockResolvedValue(
      createLedgerEntry({
        id: 'destination-ledger-entry-id',
        branchId: destinationBranchId,
        transactionType: 'inventory_transfer_in',
        quantityDeltaOnHand: '5.000',
        quantityDeltaReserved: '0.000',
        totalCost: '50.00',
      }),
    ),
  } as unknown as InventoryLedgerService & { recordLedgerEntry: ReturnType<typeof vi.fn> };
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
    stockService,
    fifoLayerService,
    ledgerService,
    transactionRunner: trackedTransactionRunner,
    auditService,
    service: new ReceiveInventoryTransferService(
      store,
      productStore,
      reservationService,
      stockService,
      fifoLayerService,
      ledgerService,
      trackedTransactionRunner,
      auditService,
    ),
  };
}

function expectNoReceiveMutation(fixture: ReturnType<typeof createFixture>): void {
  expect(
    fixture.reservationService.consumeInventoryTransferReservationInTransaction,
  ).not.toHaveBeenCalled();
  expect(fixture.stockService.incrementOnHandStock).not.toHaveBeenCalled();
  expect(fixture.fifoLayerService.createLayer).not.toHaveBeenCalled();
  expect(fixture.ledgerService.recordLedgerEntry).not.toHaveBeenCalled();
  expect(fixture.store.receivedLineInputs).toEqual([]);
  expect(fixture.store.receivedStatusInput).toBeNull();
  expect(fixture.store.insertStatusEventInput).toBeNull();
  expect(fixture.auditService.record).not.toHaveBeenCalled();
}

class FakeInventoryTransferStore extends InventoryTransferStore {
  receivedLineInputs: UpdateTransferLineReceivedQuantityInput[] = [];
  receivedStatusInput: UpdateTransferStatusToReceivedInput | null = null;
  insertStatusEventInput: InsertStatusEventInput | null = null;

  constructor(
    private readonly transferStatus: InventoryTransferRecord['status'],
    private readonly lines: readonly InventoryTransferLineRecord[],
    private readonly receivedResult: InventoryTransferRecord | null | undefined,
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

  async updateTransferStatusToReceived(input: UpdateTransferStatusToReceivedInput) {
    this.receivedStatusInput = input;

    if (this.receivedResult !== undefined) {
      return this.receivedResult;
    }

    return {
      ...createTransfer('received'),
      receivedByUserId: input.receivedByUserId,
      receivedAt: input.receivedAt,
      lockVersion: 2,
      updatedAt: input.receivedAt,
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
  findLatestTransferNumberForDate = vi.fn(async () => 'TR-20260630-000001');
}

class FakeProductStore extends ProductStore {
  async isActiveShopOwner() {
    return false;
  }

  async findProductById(): Promise<ProductRecord> {
    throw new Error('Not used by receive transfer tests.');
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
    sentByUserId: userId,
    receivedByUserId: null,
    cancelledByUserId: null,
    sentAt: new Date('2026-06-30T00:00:00.000Z'),
    receivedAt: status === 'received' ? new Date('2026-06-30T01:00:00.000Z') : null,
    cancelledAt: null,
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

function createConsumptionResult(
  overrides: Partial<InventoryTransferReservationConsumptionCommandResult> = {},
): InventoryTransferReservationConsumptionCommandResult {
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
    fifoConsumptions: [
      {
        id: 'fifo-consumption-id',
        tenantId,
        branchId: sourceBranchId,
        productId,
        fifoLayerId: sourceLayerId,
        quantityConsumed: '5.000',
        unitCost: '10.00',
        totalCost: '50.00',
        sourceType: 'inventory_transfer_line',
        sourceId: lineId,
        consumedAt: new Date('2026-06-30T01:00:00.000Z'),
      },
    ],
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
      createLedgerEntry({
        id: 'source-transfer-out-ledger-entry-id',
        transactionType: 'inventory_transfer_out',
        quantityDeltaOnHand: '-5.000',
        quantityDeltaReserved: '-5.000',
        totalCost: '50.00',
      }),
    ],
    transferOutCost: '50.00',
    varianceLossCost: '0.00',
    sentQuantity: '5.000',
    receivedQuantity: '5.000',
    varianceQuantity: '0.000',
    ...overrides,
  };
}

function createLedgerEntry(
  overrides: Partial<InventoryLedgerEntryRecord> = {},
): InventoryLedgerEntryRecord {
  return {
    id: 'ledger-entry-id',
    tenantId,
    branchId: sourceBranchId,
    productId,
    transactionType: 'inventory_transfer_out',
    quantityDeltaOnHand: '-5.000',
    quantityDeltaReserved: '-5.000',
    unitCost: null,
    totalCost: '50.00',
    sourceType: 'inventory_transfer_line',
    sourceId: lineId,
    occurredAt: new Date('2026-06-30T01:00:00.000Z'),
    createdByUserId: userId,
    ...overrides,
  };
}

function createRequest(
  line: Partial<ReceiveInventoryTransferRequest['lines'][number]> = {},
): ReceiveInventoryTransferRequest {
  return {
    lines: [
      {
        line_id: lineId,
        received_quantity: '5.000',
        ...line,
      },
    ],
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
