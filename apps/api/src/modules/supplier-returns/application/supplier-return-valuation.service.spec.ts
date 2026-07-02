import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import type { FifoConsumptionService } from '../../inventory/application/fifo-consumption.service';
import type { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import type { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import type { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { SupplierReturnService } from './supplier-return.service';
import {
  SupplierReturnStore,
  type CancelSupplierReturnInput,
  type CreateSupplierCreditInput,
  type CreateSupplierReturnInput,
  type ListSupplierReturnsInput,
  type PostSupplierReturnInput,
  type ReceivingTraceRecord,
  type SupplierCreditRecord,
  type SupplierReturnLineRecord,
  type SupplierReturnRecord,
  type UpdateDraftSupplierReturnInput,
  type UpdatePostedSupplierReturnLineInput,
} from './supplier-return.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_RETURN_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_A_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_B_ID = '88888888-8888-4888-8888-888888888881';
const RECEIVING_ID = '99999999-9999-4999-8999-999999999999';
const RECEIVING_LINE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECEIVING_LINE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FIFO_LAYER_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FIFO_LAYER_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FALLBACK_FIFO_LAYER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

class ImmediateTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({
      query: async () => ({ rows: [], rowCount: 0 }),
    });
  }
}

interface LayerCandidate {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly quantityReceived: string;
  readonly remainingQuantity: string;
  readonly unitCost: string;
  readonly sourceTransactionType: string;
  readonly sourceTransactionId: string;
  readonly receivedAt: Date;
  readonly originalSourceLayerId: string | null;
  readonly activeReservedQuantity: string;
  readonly allocatableQuantity: string;
}

class FakeSupplierReturnStore extends SupplierReturnStore {
  supplierReturn: SupplierReturnRecord = buildSupplierReturn({
    productId: PRODUCT_A_ID,
    quantity: '2.000',
    unitCost: '0.00',
  });

  receivingTrace: ReceivingTraceRecord | null = buildReceivingTrace([
    {
      receivingLineId: RECEIVING_LINE_A_ID,
      productId: PRODUCT_A_ID,
      receivedQuantity: '3.000',
      receivedUnitCost: '100.00',
      alreadyReturnedQuantity: '0.000',
    },
  ]);

  payableBalance = '150.00';
  credits: SupplierCreditRecord[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async listSupplierReturns(
    _input: ListSupplierReturnsInput,
    _client?: DatabaseQueryClient,
  ): Promise<readonly SupplierReturnRecord[]> {
    return [this.supplierReturn];
  }

  async findSupplierReturnById(
    _tenantId: string,
    _supplierReturnId: string,
    _client?: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    return this.supplierReturn;
  }

  async lockSupplierReturnById(
    _tenantId: string,
    _supplierReturnId: string,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    return this.supplierReturn;
  }

  async createSupplierReturn(
    input: CreateSupplierReturnInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord> {
    this.supplierReturn = {
      ...this.supplierReturn,
      id: input.id,
      branchId: input.branchId,
      supplierId: input.supplierId,
      originalReceivingId: input.originalReceivingId,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
      lines: input.lines.map(toSupplierReturnLineRecord),
    };

    return this.supplierReturn;
  }

  async updateDraftSupplierReturn(
    input: UpdateDraftSupplierReturnInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    if (this.supplierReturn.status !== 'draft') {
      return null;
    }

    this.supplierReturn = {
      ...this.supplierReturn,
      branchId: input.branchId,
      supplierId: input.supplierId,
      originalReceivingId: input.originalReceivingId,
      reason: input.reason,
      lines: input.lines.map(toSupplierReturnLineRecord),
    };

    return this.supplierReturn;
  }

  async cancelDraftSupplierReturn(
    _input: CancelSupplierReturnInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    if (this.supplierReturn.status !== 'draft') {
      return null;
    }

    this.supplierReturn = {
      ...this.supplierReturn,
      status: 'cancelled',
    };

    return this.supplierReturn;
  }

  async updatePostedSupplierReturnLine(
    input: UpdatePostedSupplierReturnLineInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnLineRecord | null> {
    let updatedLine: SupplierReturnLineRecord | null = null;

    this.supplierReturn = {
      ...this.supplierReturn,
      lines: this.supplierReturn.lines.map((line) => {
        if (line.id !== input.supplierReturnLineId) {
          return line;
        }

        updatedLine = {
          ...line,
          unitCost: input.unitCost,
          totalCost: input.totalCost,
        };

        return updatedLine;
      }),
    };

    return updatedLine;
  }

  async markSupplierReturnPosted(
    input: PostSupplierReturnInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null> {
    if (this.supplierReturn.status !== 'draft') {
      return null;
    }

    this.supplierReturn = {
      ...this.supplierReturn,
      status: 'posted',
      financialValue: input.financialValue,
      supplierCreditId: input.supplierCreditId,
      postedAt: input.postedAt,
    };

    return this.supplierReturn;
  }

  async getReceivingTrace(
    _tenantId: string,
    _receivingId: string,
    _client: DatabaseQueryClient,
  ): Promise<ReceivingTraceRecord | null> {
    return this.receivingTrace;
  }

  async getSupplierPayableBalanceForUpdate(
    _tenantId: string,
    _supplierId: string,
    _client: DatabaseQueryClient,
  ): Promise<string> {
    return this.payableBalance;
  }

  async createSupplierCredit(
    input: CreateSupplierCreditInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierCreditRecord> {
    const credit: SupplierCreditRecord = {
      ...input,
      branchId: input.branchId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    };

    this.credits.push(credit);

    return credit;
  }
}

function buildService(
  store: FakeSupplierReturnStore,
  layersByProduct: ReadonlyMap<string, readonly LayerCandidate[]>,
): {
  readonly service: SupplierReturnService;
  readonly stockDecrements: unknown[];
  readonly fifoLayerDecrements: unknown[];
  readonly fifoConsumptions: unknown[];
  readonly ledgerEntries: unknown[];
  readonly auditRecords: unknown[];
} {
  const stockDecrements: unknown[] = [];
  const fifoLayerDecrements: unknown[] = [];
  const fifoConsumptions: unknown[] = [];
  const ledgerEntries: unknown[] = [];
  const auditRecords: unknown[] = [];

  const stockService = {
    assertSufficientAvailableStock: async (command: { readonly productId: string }) => ({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: command.productId,
      on_hand_qty: '10.000',
      reserved_qty: '0.000',
      available_qty: '10.000',
      lock_version: 1,
    }),
    decrementOnHandStock: async (command: unknown) => {
      stockDecrements.push(command);

      return {
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        product_id: (command as { readonly productId: string }).productId,
        on_hand_qty: '8.000',
        reserved_qty: '0.000',
        available_qty: '8.000',
        lock_version: 2,
      };
    },
  } as unknown as InventoryStockBalancesService;

  const fifoLayerService = {
    lockOpenLayersForAllocation: async (command: { readonly productId: string }) =>
      layersByProduct.get(command.productId) ?? [],
    decrementRemainingQuantity: async (command: unknown) => {
      fifoLayerDecrements.push(command);

      const fifoLayerId = (command as { readonly fifoLayerId: string }).fifoLayerId;
      const layer = [...layersByProduct.values()]
        .flat()
        .find((candidate) => candidate.id === fifoLayerId);

      return layer === undefined
        ? null
        : {
            ...layer,
            remainingQuantity: '0.000',
          };
    },
  } as unknown as FifoLayerService;

  const fifoConsumptionService = {
    createConsumptions: async (
      commands: readonly {
        readonly fifoLayerId: string;
        readonly quantityConsumed: string;
        readonly unitCost: string;
        readonly totalCost: string;
        readonly productId: string;
      }[],
    ) => {
      fifoConsumptions.push(...commands);

      return commands.map((command, index) => ({
        id: `f0000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: command.productId,
        fifoLayerId: command.fifoLayerId,
        quantityConsumed: command.quantityConsumed,
        unitCost: command.unitCost,
        totalCost: command.totalCost,
        sourceType: 'supplier_return_line',
        sourceId: store.supplierReturn.lines.find((line) => line.productId === command.productId)
          ?.id,
        consumedAt: new Date(),
      }));
    },
  } as unknown as FifoConsumptionService;

  const ledgerService = {
    recordLedgerEntry: async (command: unknown) => {
      ledgerEntries.push(command);

      return {
        id: `90000000-0000-4000-8000-${ledgerEntries.length.toString().padStart(12, '0')}`,
        ...(command as Record<string, unknown>),
      };
    },
  } as unknown as InventoryLedgerService;

  const auditService = {
    record: async (input: unknown) => {
      auditRecords.push(input);

      return input;
    },
  };

  return {
    service: new SupplierReturnService(
      store,
      stockService,
      fifoLayerService,
      fifoConsumptionService,
      ledgerService,
      new ImmediateTransactionRunner(),
      auditService as never,
    ),
    stockDecrements,
    fifoLayerDecrements,
    fifoConsumptions,
    ledgerEntries,
    auditRecords,
  };
}

function buildSession(): TenantContextAuthenticatedSession {
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
      status: 'active',
    },
    effective_permissions: ['supplier_returns.create', 'supplier_returns.read'],
    branches: [{ id: BRANCH_ID }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

function buildSupplierReturn(input: {
  readonly productId: string;
  readonly quantity: string;
  readonly unitCost: string;
}): SupplierReturnRecord {
  return {
    id: SUPPLIER_RETURN_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    branchName: 'Main Branch',
    branchStatus: 'active',
    supplierId: SUPPLIER_ID,
    supplierName: 'Parts Supplier',
    supplierStatus: 'active',
    originalReceivingId: RECEIVING_ID,
    status: 'draft',
    reason: 'Damaged items returned to supplier.',
    financialValue: '0.00',
    supplierCreditId: null,
    postedAt: null,
    createdByUserId: USER_ID,
    createdAt: new Date('2026-07-02T00:00:00Z'),
    lines: [
      buildSupplierReturnLine({
        id: '60000000-0000-4000-8000-000000000001',
        productId: input.productId,
        quantity: input.quantity,
        unitCost: input.unitCost,
      }),
    ],
  };
}

function buildSupplierReturnLine(input: {
  readonly id: string;
  readonly productId: string;
  readonly quantity: string;
  readonly unitCost: string;
}): SupplierReturnLineRecord {
  return {
    id: input.id,
    tenantId: TENANT_ID,
    supplierReturnId: SUPPLIER_RETURN_ID,
    productId: input.productId,
    productName: input.productId === PRODUCT_A_ID ? 'Brake Pad' : 'Spark Plug',
    returnedQuantity: input.quantity,
    unitCost: input.unitCost,
    totalCost: calculateLineTotal(input.quantity, input.unitCost),
  };
}

function toSupplierReturnLineRecord(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly productId: string;
  readonly returnedQuantity: string;
  readonly unitCost: string;
  readonly totalCost: string;
}): SupplierReturnLineRecord {
  return {
    ...input,
    productName: input.productId === PRODUCT_A_ID ? 'Brake Pad' : 'Spark Plug',
  };
}

function buildReceivingTrace(
  lines: ReceivingTraceRecord['lines'],
  paymentTerms: 'cash' | 'credit' = 'credit',
): ReceivingTraceRecord {
  return {
    id: RECEIVING_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    supplierId: SUPPLIER_ID,
    purchaseOrderId: '10000000-0000-4000-8000-000000000001',
    paymentTerms,
    lines,
  };
}

function buildLayer(input: {
  readonly id: string;
  readonly productId: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly sourceTransactionId: string;
  readonly receivedAt: string;
}): LayerCandidate {
  return {
    id: input.id,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: input.productId,
    quantityReceived: input.quantity,
    remainingQuantity: input.quantity,
    unitCost: input.unitCost,
    sourceTransactionType: 'purchase_receive',
    sourceTransactionId: input.sourceTransactionId,
    receivedAt: new Date(input.receivedAt),
    originalSourceLayerId: null,
    activeReservedQuantity: '0.000',
    allocatableQuantity: input.quantity,
  };
}

function calculateLineTotal(quantity: string, unitCost: string): string {
  const [quantityWhole = '0', quantityDecimal = ''] = quantity.split('.');
  const [costWhole = '0', costDecimal = ''] = unitCost.split('.');
  const quantityUnits =
    BigInt(quantityWhole) * 1000n + BigInt(quantityDecimal.padEnd(3, '0').slice(0, 3));
  const costCents = BigInt(costWhole) * 100n + BigInt(costDecimal.padEnd(2, '0').slice(0, 2));
  const totalCents = (quantityUnits * costCents + 500n) / 1000n;
  const whole = totalCents / 100n;
  const cents = totalCents % 100n;

  return `${whole.toString()}.${cents.toString().padStart(2, '0')}`;
}

describe('SupplierReturnService valuation', () => {
  it('uses original received unit cost for traceable financial value and FIFO layer cost for inventory value', async () => {
    const store = new FakeSupplierReturnStore();
    store.payableBalance = '150.00';

    const { service, ledgerEntries } = buildService(
      store,
      new Map([
        [
          PRODUCT_A_ID,
          [
            buildLayer({
              id: FIFO_LAYER_A_ID,
              productId: PRODUCT_A_ID,
              quantity: '2.000',
              unitCost: '80.00',
              sourceTransactionId: RECEIVING_LINE_A_ID,
              receivedAt: '2026-07-01T00:00:00Z',
            }),
          ],
        ],
      ]),
    );

    const response = await service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession());

    expect(response.supplier_return.status).toBe('posted');
    expect(response.supplier_return.financial_value).toBe('200.00');
    expect(response.inventory_effect.lines[0]).toMatchObject({
      product_id: PRODUCT_A_ID,
      returned_quantity: '2.000',
      inventory_value: '160.00',
      financial_value: '200.00',
    });
    expect(response.ap_effect).toMatchObject({
      supplier_balance_before: '150.00',
      return_value: '200.00',
      ap_reduction_amount: '150.00',
      supplier_credit_amount: '200.00',
      supplier_balance_after: '-50.00',
    });
    expect(store.supplierReturn.lines[0]).toMatchObject({
      unitCost: '100.00',
      totalCost: '200.00',
    });
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]).toMatchObject({
      tenantId: TENANT_ID,
      supplierId: SUPPLIER_ID,
      branchId: BRANCH_ID,
      amount: '200.00',
      sourceType: 'supplier_return',
      sourceId: SUPPLIER_RETURN_ID,
    });
    expect(ledgerEntries[0]).toMatchObject({
      transactionType: 'supplier_return',
      quantityDeltaOnHand: '-2.000',
      unitCost: '80.00',
      totalCost: '160.00',
      sourceType: 'supplier_return_line',
    });
  });

  it('uses FIFO-consumed weighted unit cost when the original receiving record is not traceable', async () => {
    const store = new FakeSupplierReturnStore();
    store.supplierReturn = {
      ...store.supplierReturn,
      originalReceivingId: null,
      lines: store.supplierReturn.lines.map((line) => ({
        ...line,
        unitCost: '0.00',
        totalCost: '0.00',
      })),
    };
    store.receivingTrace = null;
    store.payableBalance = '0.00';

    const { service, fifoConsumptions, ledgerEntries } = buildService(
      store,
      new Map([
        [
          PRODUCT_A_ID,
          [
            buildLayer({
              id: FIFO_LAYER_A_ID,
              productId: PRODUCT_A_ID,
              quantity: '1.000',
              unitCost: '80.00',
              sourceTransactionId: '20000000-0000-4000-8000-000000000001',
              receivedAt: '2026-07-01T00:00:00Z',
            }),
            buildLayer({
              id: FALLBACK_FIFO_LAYER_ID,
              productId: PRODUCT_A_ID,
              quantity: '1.000',
              unitCost: '120.00',
              sourceTransactionId: '20000000-0000-4000-8000-000000000002',
              receivedAt: '2026-07-02T00:00:00Z',
            }),
          ],
        ],
      ]),
    );

    const response = await service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession());

    expect(response.supplier_return.financial_value).toBe('200.00');
    expect(store.supplierReturn.lines[0]).toMatchObject({
      unitCost: '100.00',
      totalCost: '200.00',
    });
    expect(response.inventory_effect.lines[0]).toMatchObject({
      inventory_value: '200.00',
      financial_value: '200.00',
    });
    expect(fifoConsumptions).toHaveLength(2);
    expect(ledgerEntries).toHaveLength(2);
    expect(ledgerEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitCost: '80.00', totalCost: '80.00' }),
        expect.objectContaining({ unitCost: '120.00', totalCost: '120.00' }),
      ]),
    );
  });

  it('values multi-line supplier returns independently and posts one supplier credit source record', async () => {
    const store = new FakeSupplierReturnStore();
    store.supplierReturn = {
      ...store.supplierReturn,
      lines: [
        buildSupplierReturnLine({
          id: '60000000-0000-4000-8000-000000000001',
          productId: PRODUCT_A_ID,
          quantity: '1.000',
          unitCost: '0.00',
        }),
        buildSupplierReturnLine({
          id: '60000000-0000-4000-8000-000000000002',
          productId: PRODUCT_B_ID,
          quantity: '2.000',
          unitCost: '0.00',
        }),
      ],
    };
    store.receivingTrace = buildReceivingTrace([
      {
        receivingLineId: RECEIVING_LINE_A_ID,
        productId: PRODUCT_A_ID,
        receivedQuantity: '1.000',
        receivedUnitCost: '70.00',
        alreadyReturnedQuantity: '0.000',
      },
      {
        receivingLineId: RECEIVING_LINE_B_ID,
        productId: PRODUCT_B_ID,
        receivedQuantity: '3.000',
        receivedUnitCost: '40.00',
        alreadyReturnedQuantity: '0.000',
      },
    ]);
    store.payableBalance = '500.00';

    const { service, stockDecrements, fifoConsumptions, ledgerEntries } = buildService(
      store,
      new Map([
        [
          PRODUCT_A_ID,
          [
            buildLayer({
              id: FIFO_LAYER_A_ID,
              productId: PRODUCT_A_ID,
              quantity: '1.000',
              unitCost: '70.00',
              sourceTransactionId: RECEIVING_LINE_A_ID,
              receivedAt: '2026-07-01T00:00:00Z',
            }),
          ],
        ],
        [
          PRODUCT_B_ID,
          [
            buildLayer({
              id: FIFO_LAYER_B_ID,
              productId: PRODUCT_B_ID,
              quantity: '2.000',
              unitCost: '40.00',
              sourceTransactionId: RECEIVING_LINE_B_ID,
              receivedAt: '2026-07-01T00:00:00Z',
            }),
          ],
        ],
      ]),
    );

    const response = await service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession());

    expect(response.supplier_return.financial_value).toBe('150.00');
    expect(response.inventory_effect.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: PRODUCT_A_ID, financial_value: '70.00' }),
        expect.objectContaining({ product_id: PRODUCT_B_ID, financial_value: '80.00' }),
      ]),
    );
    expect(response.ap_effect).toMatchObject({
      supplier_balance_before: '500.00',
      return_value: '150.00',
      ap_reduction_amount: '150.00',
      supplier_credit_amount: '150.00',
      supplier_balance_after: '350.00',
    });
    expect(stockDecrements).toHaveLength(2);
    expect(fifoConsumptions).toHaveLength(2);
    expect(ledgerEntries).toHaveLength(2);
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]?.amount).toBe('150.00');
  });

  it('does not apply valuation, inventory, FIFO, ledger, AP, credit, or posted audit effects when a draft return is cancelled', async () => {
    const store = new FakeSupplierReturnStore();
    const {
      service,
      stockDecrements,
      fifoLayerDecrements,
      fifoConsumptions,
      ledgerEntries,
      auditRecords,
    } = buildService(
      store,
      new Map([
        [
          PRODUCT_A_ID,
          [
            buildLayer({
              id: FIFO_LAYER_A_ID,
              productId: PRODUCT_A_ID,
              quantity: '2.000',
              unitCost: '100.00',
              sourceTransactionId: RECEIVING_LINE_A_ID,
              receivedAt: '2026-07-01T00:00:00Z',
            }),
          ],
        ],
      ]),
    );

    const response = await service.cancelSupplierReturn(
      SUPPLIER_RETURN_ID,
      { reason: 'Return cancelled before posting.' },
      buildSession(),
    );

    expect(response.supplier_return.status).toBe('cancelled');
    expect(response.supplier_return.financial_value).toBe('0.00');
    expect(store.credits).toHaveLength(0);
    expect(stockDecrements).toHaveLength(0);
    expect(fifoLayerDecrements).toHaveLength(0);
    expect(fifoConsumptions).toHaveLength(0);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({ action: 'supplier_returns.cancelled' });
  });
});
