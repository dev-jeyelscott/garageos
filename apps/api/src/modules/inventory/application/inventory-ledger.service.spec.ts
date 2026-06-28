import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  INVENTORY_TRANSACTION_TYPES,
  InventoryLedgerStore,
  type CreateInventoryLedgerEntryInput,
  type InventoryLedgerEntryRecord,
} from './inventory-ledger.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('InventoryLedgerService', () => {
  it('records a normalized immutable ledger entry command through the ledger store', async () => {
    const { service, store } = createService();
    const client = createNoopDatabaseClient();

    const entry = await service.recordLedgerEntry(
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        transactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
        quantityDeltaOnHand: '5',
        quantityDeltaReserved: '0',
        unitCost: '125.5',
        totalCost: '627.50',
        sourceType: 'Purchase_Receiving',
        sourceId: SOURCE_ID,
        occurredAt: NOW,
        createdByUserId: USER_ID,
      },
      client,
    );

    expect(store.inputs).toHaveLength(1);
    expect(store.clients[0]).toBe(client);
    expect(store.inputs[0]).toMatchObject({
      id: expect.any(String),
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      transactionType: 'purchase_receive',
      quantityDeltaOnHand: '5.000',
      quantityDeltaReserved: '0.000',
      unitCost: '125.50',
      totalCost: '627.50',
      sourceType: 'purchase_receiving',
      sourceId: SOURCE_ID,
      occurredAt: NOW,
      createdByUserId: USER_ID,
    });
    expect(entry).toEqual(store.entries[0]);
  });

  it('rejects unsupported inventory transaction types', async () => {
    const { service } = createService();

    await expect(
      service.recordLedgerEntry({
        ...createCommand(),
        transactionType: 'unsupported_type',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'transaction_type',
          code: 'unsupported_inventory_transaction_type',
        },
      ],
    });
  });

  it('rejects entries that do not change on-hand or reserved quantity', async () => {
    const { service } = createService();

    await expect(
      service.recordLedgerEntry({
        ...createCommand(),
        quantityDeltaOnHand: '0',
        quantityDeltaReserved: '0.000',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'quantity_delta_on_hand',
          code: 'inventory_ledger_delta_required',
        }),
        expect.objectContaining({
          field: 'quantity_delta_reserved',
          code: 'inventory_ledger_delta_required',
        }),
      ]),
    });
  });

  it('rejects invalid signed quantity precision', async () => {
    const { service } = createService();

    await expect(
      service.recordLedgerEntry({
        ...createCommand(),
        quantityDeltaOnHand: '1.0001',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'quantity_delta_on_hand',
          code: 'invalid_quantity_delta',
        },
      ],
    });
  });

  it('rejects negative cost values', async () => {
    const { service } = createService();

    await expect(
      service.recordLedgerEntry({
        ...createCommand(),
        unitCost: '-1.00',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'unit_cost',
          code: 'invalid_money_amount',
        },
      ],
    });
  });
});

function createService(): {
  readonly service: InventoryLedgerService;
  readonly store: FakeInventoryLedgerStore;
} {
  const store = new FakeInventoryLedgerStore();

  return {
    service: new InventoryLedgerService(store),
    store,
  };
}

function createCommand() {
  return {
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    transactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_RESERVATION,
    quantityDeltaOnHand: '0',
    quantityDeltaReserved: '2.000',
    unitCost: null,
    totalCost: null,
    sourceType: 'job_order_line',
    sourceId: SOURCE_ID,
    occurredAt: NOW,
    createdByUserId: USER_ID,
  };
}

function createNoopDatabaseClient(): DatabaseQueryClient {
  return {
    async query() {
      return {
        rows: [],
        rowCount: 0,
      };
    },
  };
}

class FakeInventoryLedgerStore extends InventoryLedgerStore {
  readonly inputs: CreateInventoryLedgerEntryInput[] = [];
  readonly clients: (DatabaseQueryClient | undefined)[] = [];
  readonly entries: InventoryLedgerEntryRecord[] = [];

  async createLedgerEntry(
    input: CreateInventoryLedgerEntryInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryLedgerEntryRecord> {
    this.inputs.push(input);
    this.clients.push(client);

    const entry: InventoryLedgerEntryRecord = {
      ...input,
    };

    this.entries.push(entry);

    return entry;
  }
}
