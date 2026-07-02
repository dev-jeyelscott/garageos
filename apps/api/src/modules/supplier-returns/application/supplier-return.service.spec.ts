import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
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
const SUPPLIER_RETURN_LINE_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const RECEIVING_ID = '88888888-8888-4888-8888-888888888888';
const RECEIVING_LINE_ID = '99999999-9999-4999-8999-999999999999';
const ORIGINAL_FIFO_LAYER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

class ImmediateTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({
      query: async () => ({ rows: [], rowCount: 0 }),
    });
  }
}

class FakeSupplierReturnStore extends SupplierReturnStore {
  supplierReturn: SupplierReturnRecord = buildSupplierReturn();
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
      ...buildSupplierReturn(),
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
    return {
      id: RECEIVING_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      purchaseOrderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      paymentTerms: 'credit',
      lines: [
        {
          receivingLineId: RECEIVING_LINE_ID,
          productId: PRODUCT_ID,
          receivedQuantity: '3.000',
          receivedUnitCost: '100.00',
          alreadyReturnedQuantity: '0.000',
        },
      ],
    };
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

function buildService(store: FakeSupplierReturnStore): {
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
    assertSufficientAvailableStock: async () => ({
      tenant_id: TENANT_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      on_hand_qty: '5.000',
      reserved_qty: '0.000',
      available_qty: '5.000',
      lock_version: 1,
    }),
    decrementOnHandStock: async (command: unknown) => {
      stockDecrements.push(command);

      return {
        tenant_id: TENANT_ID,
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        on_hand_qty: '3.000',
        reserved_qty: '0.000',
        available_qty: '3.000',
        lock_version: 2,
      };
    },
  } as unknown as InventoryStockBalancesService;

  const fifoLayerService = {
    lockOpenLayersForAllocation: async () => [
      {
        id: ORIGINAL_FIFO_LAYER_ID,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityReceived: '3.000',
        remainingQuantity: '3.000',
        unitCost: '100.00',
        sourceTransactionType: 'purchase_receive',
        sourceTransactionId: RECEIVING_LINE_ID,
        receivedAt: new Date('2026-07-01T00:00:00Z'),
        originalSourceLayerId: null,
        activeReservedQuantity: '0.000',
        allocatableQuantity: '3.000',
      },
    ],
    decrementRemainingQuantity: async (command: unknown) => {
      fifoLayerDecrements.push(command);

      return {
        id: ORIGINAL_FIFO_LAYER_ID,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityReceived: '3.000',
        remainingQuantity: '1.000',
        unitCost: '100.00',
        sourceTransactionType: 'purchase_receive',
        sourceTransactionId: RECEIVING_LINE_ID,
        receivedAt: new Date('2026-07-01T00:00:00Z'),
        originalSourceLayerId: null,
      };
    },
  } as unknown as FifoLayerService;

  const fifoConsumptionService = {
    createConsumptions: async (commands: readonly { readonly fifoLayerId: string }[]) => {
      fifoConsumptions.push(...commands);

      return commands.map((command, index) => ({
        id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        fifoLayerId: command.fifoLayerId,
        quantityConsumed: '2.000',
        unitCost: '100.00',
        totalCost: '200.00',
        sourceType: 'supplier_return_line',
        sourceId: SUPPLIER_RETURN_LINE_ID,
        consumedAt: new Date(),
      }));
    },
  } as unknown as FifoConsumptionService;

  const ledgerService = {
    recordLedgerEntry: async (command: unknown) => {
      ledgerEntries.push(command);

      return {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        transactionType: 'supplier_return',
        quantityDeltaOnHand: '-2.000',
        quantityDeltaReserved: '0.000',
        unitCost: '100.00',
        totalCost: '200.00',
        sourceType: 'supplier_return_line',
        sourceId: SUPPLIER_RETURN_LINE_ID,
        occurredAt: new Date(),
        createdByUserId: USER_ID,
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
    effective_permissions: options.effectivePermissions ?? [
      'supplier_returns.create',
      'supplier_returns.read',
    ],
    branches: options.branches ?? [{ id: BRANCH_ID }],
    tenant_wide_branch_access: options.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

function buildSupplierReturn(): SupplierReturnRecord {
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
      {
        id: SUPPLIER_RETURN_LINE_ID,
        tenantId: TENANT_ID,
        supplierReturnId: SUPPLIER_RETURN_ID,
        productId: PRODUCT_ID,
        productName: 'Brake Pad',
        returnedQuantity: '2.000',
        unitCost: '100.00',
        totalCost: '200.00',
      },
    ],
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
    productName: 'Brake Pad',
  };
}

describe('SupplierReturnService', () => {
  it('posts a traceable supplier return with stock, FIFO, ledger, supplier credit, and audit effects', async () => {
    const store = new FakeSupplierReturnStore();
    const {
      service,
      stockDecrements,
      fifoLayerDecrements,
      fifoConsumptions,
      ledgerEntries,
      auditRecords,
    } = buildService(store);

    const response = await service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession());

    expect(response.supplier_return.status).toBe('posted');
    expect(response.supplier_return.financial_value).toBe('200.00');
    expect(response.ap_effect.supplier_balance_before).toBe('150.00');
    expect(response.ap_effect.ap_reduction_amount).toBe('150.00');
    expect(response.ap_effect.supplier_credit_amount).toBe('200.00');
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]?.amount).toBe('200.00');
    expect(stockDecrements).toHaveLength(1);
    expect(fifoLayerDecrements).toHaveLength(1);
    expect(fifoConsumptions).toHaveLength(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]).toMatchObject({
      transactionType: 'supplier_return',
      quantityDeltaOnHand: '-2.000',
      sourceType: 'supplier_return_line',
    });
    expect(auditRecords).toHaveLength(1);
  });

  it('uses FIFO-consumed value when original receiving is not traceable', async () => {
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
    store.payableBalance = '0.00';
    const { service } = buildService(store);

    const response = await service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession());

    expect(response.supplier_return.financial_value).toBe('200.00');
    expect(response.ap_effect.ap_reduction_amount).toBe('0.00');
    expect(response.ap_effect.supplier_credit_amount).toBe('200.00');
    expect(store.credits[0]?.amount).toBe('200.00');
  });

  it('blocks posting when tenant is read-only', async () => {
    const store = new FakeSupplierReturnStore();
    const { service, stockDecrements, fifoLayerDecrements, ledgerEntries, auditRecords } =
      buildService(store);

    await expect(
      service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession({ tenantStatus: 'read_only' })),
    ).rejects.toMatchObject({
      code: 'subscription_access_blocked',
    });

    expect(stockDecrements).toHaveLength(0);
    expect(fifoLayerDecrements).toHaveLength(0);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks posting without supplier_returns.create permission', async () => {
    const store = new FakeSupplierReturnStore();
    const { service } = buildService(store);

    await expect(
      service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession({ effectivePermissions: [] })),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'supplier_returns.create' }],
    });
  });

  it('blocks posting when branch access is denied', async () => {
    const store = new FakeSupplierReturnStore();
    const { service } = buildService(store);

    await expect(
      service.postSupplierReturn(
        SUPPLIER_RETURN_ID,
        buildSession({ branches: [], tenantWideBranchAccess: false }),
      ),
    ).rejects.toMatchObject({
      code: 'branch_access_denied',
    });
  });

  it('blocks traceable over-returning against the original receiving record', async () => {
    const store = new FakeSupplierReturnStore();
    store.supplierReturn = {
      ...store.supplierReturn,
      lines: store.supplierReturn.lines.map((line) => ({
        ...line,
        returnedQuantity: '4.000',
      })),
    };
    const { service } = buildService(store);

    await expect(
      service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('blocks posting non-draft supplier returns', async () => {
    const store = new FakeSupplierReturnStore();
    store.supplierReturn = {
      ...store.supplierReturn,
      status: 'posted',
      postedAt: new Date('2026-07-02T01:00:00Z'),
    };
    const { service } = buildService(store);

    await expect(
      service.postSupplierReturn(SUPPLIER_RETURN_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });
  });
});
