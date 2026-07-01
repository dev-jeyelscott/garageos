import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import type { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import type { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import type { ProductStore } from '../../products/application/product.store';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderForReceivingRecord,
  type PurchaseOrderLineRecord,
  type PurchaseReceivingLineRecord,
  type PurchaseReceivingRecord,
  type SupplierPayableRecord,
} from './purchase-order.records';
import {
  PurchaseOrderStore,
  type CreatePurchaseReceivingInput,
  type CreatePurchaseReceivingLineInput,
  type CreateSupplierPayableInput,
  type IncrementPurchaseOrderLineReceivedQuantityInput,
  type SetReceivingLineFifoLayerInput,
  type UpdatePurchaseOrderStatusInput,
} from './purchase-order.store';
import { ReceivePurchaseOrderService } from './receive-purchase-order.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

class ImmediateTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({
      query: async () => ({ rows: [], rowCount: 0 }),
    });
  }
}

class FakePurchaseOrderStore extends PurchaseOrderStore {
  purchaseOrder: PurchaseOrderForReceivingRecord = {
    id: PURCHASE_ORDER_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    supplierId: SUPPLIER_ID,
    purchaseOrderNumber: 'PO-20260701-000001',
    status: PURCHASE_ORDER_STATUSES.ORDERED,
    paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT,
    branchStatus: 'active',
    supplierStatus: 'active',
  };

  lines: PurchaseOrderLineRecord[] = [
    {
      id: LINE_ID,
      tenantId: TENANT_ID,
      purchaseOrderId: PURCHASE_ORDER_ID,
      productId: PRODUCT_ID,
      orderedQuantity: '10.000',
      receivedQuantity: '0.000',
      unitCost: '100.00',
    },
  ];

  receiving: PurchaseReceivingRecord | null = null;
  receivingLines: PurchaseReceivingLineRecord[] = [];
  supplierPayables: SupplierPayableRecord[] = [];

  async lockPurchaseOrderForReceiving(
    _tenantId: string,
    _purchaseOrderId: string,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    return this.purchaseOrder;
  }

  async listPurchaseOrderLinesForUpdate(
    _tenantId: string,
    _purchaseOrderId: string,
    _client: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderLineRecord[]> {
    return this.lines;
  }

  async createReceiving(
    input: CreatePurchaseReceivingInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingRecord> {
    this.receiving = input;

    return input;
  }

  async createReceivingLine(
    input: CreatePurchaseReceivingLineInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingLineRecord> {
    this.receivingLines.push(input);

    return input;
  }

  async setReceivingLineFifoLayerId(
    input: SetReceivingLineFifoLayerInput,
    _client: DatabaseQueryClient,
  ): Promise<void> {
    this.receivingLines = this.receivingLines.map((line) =>
      line.id === input.receivingLineId ? { ...line, fifoLayerId: input.fifoLayerId } : line,
    );
  }

  async incrementPurchaseOrderLineReceivedQuantity(
    input: IncrementPurchaseOrderLineReceivedQuantityInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderLineRecord | null> {
    const line = this.lines.find((candidate) => candidate.id === input.purchaseOrderLineId);

    if (line === undefined) {
      return null;
    }

    const nextReceived = addQuantity(line.receivedQuantity, input.receivedQuantity);

    if (compareQuantity(nextReceived, line.orderedQuantity) > 0) {
      return null;
    }

    const updatedLine = { ...line, receivedQuantity: nextReceived };

    this.lines = this.lines.map((candidate) =>
      candidate.id === input.purchaseOrderLineId ? updatedLine : candidate,
    );

    return updatedLine;
  }

  async updatePurchaseOrderStatus(
    input: UpdatePurchaseOrderStatusInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    if (this.purchaseOrder.status !== input.fromStatus) {
      return null;
    }

    this.purchaseOrder = { ...this.purchaseOrder, status: input.toStatus };

    return this.purchaseOrder;
  }

  async createSupplierPayable(
    input: CreateSupplierPayableInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierPayableRecord> {
    const payable: SupplierPayableRecord = {
      ...input,
      branchId: input.branchId,
    };

    this.supplierPayables.push(payable);

    return payable;
  }
}

function buildService(store: FakePurchaseOrderStore): {
  readonly service: ReceivePurchaseOrderService;
  readonly stockIncrements: unknown[];
  readonly fifoLayers: unknown[];
  readonly ledgerEntries: unknown[];
  readonly auditRecords: unknown[];
} {
  const stockIncrements: unknown[] = [];
  const fifoLayers: unknown[] = [];
  const ledgerEntries: unknown[] = [];
  const auditRecords: unknown[] = [];

  const productStore = {
    isActiveShopOwner: async () => false,
  } as unknown as ProductStore;

  const stockService = {
    incrementOnHandStock: async (command: unknown) => {
      stockIncrements.push(command);

      return {
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        on_hand_qty: '5.000',
        reserved_qty: '0.000',
        available_qty: '5.000',
        lock_version: 1,
      };
    },
  } as unknown as InventoryStockBalancesService;

  const fifoService = {
    createLayer: async (command: unknown) => {
      const layer = {
        id: '88888888-8888-4888-8888-888888888888',
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityReceived: '5.000',
        remainingQuantity: '5.000',
        unitCost: '100.00',
        sourceTransactionType: 'purchase_receive',
        sourceTransactionId: store.receivingLines[0]?.id ?? LINE_ID,
        receivedAt: new Date(),
        originalSourceLayerId: null,
      };

      fifoLayers.push(command);

      return layer;
    },
  } as unknown as FifoLayerService;

  const ledgerService = {
    recordLedgerEntry: async (command: unknown) => {
      const ledgerEntry = {
        id: '99999999-9999-4999-8999-999999999999',
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        transactionType: 'purchase_receive',
        quantityDeltaOnHand: '5.000',
        quantityDeltaReserved: '0.000',
        unitCost: '100.00',
        totalCost: '500.00',
        sourceType: 'purchase_receiving_line',
        sourceId: store.receivingLines[0]?.id ?? LINE_ID,
        occurredAt: new Date(),
        createdByUserId: USER_ID,
      };

      ledgerEntries.push(command);

      return ledgerEntry;
    },
  } as unknown as InventoryLedgerService;

  const auditService = {
    record: async (input: unknown) => {
      auditRecords.push(input);

      return input;
    },
  };

  return {
    service: new ReceivePurchaseOrderService(
      store,
      productStore,
      stockService,
      fifoService,
      ledgerService,
      new ImmediateTransactionRunner(),
      auditService as never,
    ),
    stockIncrements,
    fifoLayers,
    ledgerEntries,
    auditRecords,
  };
}

interface BuildSessionOptions {
  readonly tenantStatus?: TenantStatus;
  readonly effectivePermissions?: TenantContextAuthenticatedSession['effective_permissions'];
  readonly branches?: TenantContextAuthenticatedSession['branches'];
  readonly tenantWideBranchAccess?: boolean;
}

function buildSession(options: BuildSessionOptions = {}): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: TENANT_ID,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: options.tenantStatus ?? 'active',
    },
    effective_permissions: options.effectivePermissions ?? ['purchases.receive'],
    branches: options.branches ?? [{ id: BRANCH_ID }],
    tenant_wide_branch_access: options.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

describe('ReceivePurchaseOrderService', () => {
  it('receives a credit purchase order and creates stock, FIFO, ledger, AP, and audit effects', async () => {
    const store = new FakePurchaseOrderStore();
    const { service, stockIncrements, fifoLayers, ledgerEntries, auditRecords } =
      buildService(store);

    const response = await service.receive(
      PURCHASE_ORDER_ID,
      {
        received_at: new Date('2026-07-01T04:00:00Z'),
        lines: [
          {
            purchase_order_line_id: LINE_ID,
            received_quantity: '5.000',
            received_unit_cost: '100.00',
          },
        ],
      },
      buildSession(),
    );

    expect(response.status).toBe(PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED);
    expect(response.ap_effect.created).toBe(true);
    expect(response.ap_effect.amount_delta).toBe('500.00');
    expect(store.supplierPayables).toHaveLength(1);

    const payable = store.supplierPayables[0];

    expect(payable).toMatchObject({
      tenantId: TENANT_ID,
      supplierId: SUPPLIER_ID,
      branchId: BRANCH_ID,
      sourceType: 'purchase_receiving',
      amountDelta: '500.00',
    });
    expect(payable?.sourceId).toBe(store.receiving?.id);
    expect(stockIncrements).toHaveLength(1);
    expect(fifoLayers).toHaveLength(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(auditRecords).toHaveLength(1);
  });

  it('receives a cash purchase order without creating AP', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = {
      ...store.purchaseOrder,
      paymentTerms: PURCHASE_PAYMENT_TERMS.CASH,
    };

    const { service } = buildService(store);

    const response = await service.receive(
      PURCHASE_ORDER_ID,
      {
        payment_method: 'cash',
        payment_reference: 'OR-123',
        lines: [
          {
            purchase_order_line_id: LINE_ID,
            received_quantity: '10.000',
            received_unit_cost: '100.00',
          },
        ],
      },
      buildSession(),
    );

    expect(response.status).toBe(PURCHASE_ORDER_STATUSES.RECEIVED);
    expect(response.ap_effect.created).toBe(false);
    expect(response.ap_effect.amount_delta).toBe('0.00');
    expect(store.supplierPayables).toHaveLength(0);
    expect(store.receiving?.paymentMethod).toBe('cash');
    expect(store.receiving?.paymentReference).toBe('OR-123');
  });

  it('blocks cash purchase receiving without payment method', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = {
      ...store.purchaseOrder,
      paymentTerms: PURCHASE_PAYMENT_TERMS.CASH,
    };

    const { service } = buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '1.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('blocks receiving when tenant is read-only', async () => {
    const store = new FakePurchaseOrderStore();
    const { service, stockIncrements, fifoLayers, ledgerEntries, auditRecords } =
      buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '1.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession({ tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: 'subscription_access_blocked',
    });

    expect(store.receiving).toBeNull();
    expect(stockIncrements).toHaveLength(0);
    expect(fifoLayers).toHaveLength(0);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks receiving without purchases.receive permission', async () => {
    const store = new FakePurchaseOrderStore();
    const { service, stockIncrements, fifoLayers, ledgerEntries, auditRecords } =
      buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '1.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession({ effectivePermissions: [] }),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'purchases.receive' }],
    });

    expect(store.receiving).toBeNull();
    expect(stockIncrements).toHaveLength(0);
    expect(fifoLayers).toHaveLength(0);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks receiving when branch access is denied', async () => {
    const store = new FakePurchaseOrderStore();
    const { service, stockIncrements, fifoLayers, ledgerEntries, auditRecords } =
      buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '1.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession({
          branches: [],
          tenantWideBranchAccess: false,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'branch_access_denied',
    });

    expect(store.receiving).toBeNull();
    expect(stockIncrements).toHaveLength(0);
    expect(fifoLayers).toHaveLength(0);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks over-receiving', async () => {
    const store = new FakePurchaseOrderStore();
    const { service } = buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '11.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('blocks receiving for non-receivable purchase order statuses', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = {
      ...store.purchaseOrder,
      status: PURCHASE_ORDER_STATUSES.DRAFT,
    };

    const { service } = buildService(store);

    await expect(
      service.receive(
        PURCHASE_ORDER_ID,
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '1.000',
              received_unit_cost: '100.00',
            },
          ],
        },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });
  });
});

function addQuantity(left: string, right: string): string {
  return formatQuantity(parseQuantity(left) + parseQuantity(right));
}

function compareQuantity(left: string, right: string): number {
  const leftUnits = parseQuantity(left);
  const rightUnits = parseQuantity(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function parseQuantity(value: string): bigint {
  const [whole = '0', decimal = ''] = value.split('.');

  return BigInt(whole) * 1000n + BigInt(decimal.padEnd(3, '0'));
}

function formatQuantity(value: bigint): string {
  return `${(value / 1000n).toString()}.${(value % 1000n).toString().padStart(3, '0')}`;
}
