import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  FIFO_LAYER_SOURCE_TRANSACTION_TYPES,
  FifoLayerStore,
  type CreateFifoLayerInput,
  type FifoLayerAllocationCandidateRecord,
  type FifoLayerRecord,
  type LockOpenFifoLayersForAllocationInput,
} from './fifo-layer.store';
import { FifoLayerService } from './fifo-layer.service';
import { INVENTORY_TRANSACTION_TYPES } from './inventory-ledger.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_ID = '77777777-7777-4777-8777-777777777777';
const ORIGINAL_SOURCE_LAYER_ID = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('FifoLayerService', () => {
  it('creates a normalized FIFO layer with remaining quantity equal to received quantity', async () => {
    const { service, store } = createService();
    const client = createNoopDatabaseClient();

    const layer = await service.createLayer(
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityReceived: '5',
        unitCost: '125.5',
        sourceTransactionType: 'Purchase_Receive',
        sourceTransactionId: SOURCE_ID,
        receivedAt: NOW,
        originalSourceLayerId: ORIGINAL_SOURCE_LAYER_ID,
      },
      client,
    );

    expect(store.createInputs).toHaveLength(1);
    expect(store.createClients[0]).toBe(client);
    expect(store.createInputs[0]).toMatchObject({
      id: expect.any(String),
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityReceived: '5.000',
      remainingQuantity: '5.000',
      unitCost: '125.50',
      sourceTransactionType: FIFO_LAYER_SOURCE_TRANSACTION_TYPES.PURCHASE_RECEIVE,
      sourceTransactionId: SOURCE_ID,
      receivedAt: NOW,
      originalSourceLayerId: ORIGINAL_SOURCE_LAYER_ID,
    });
    expect(layer).toEqual(store.createdLayers[0]);
  });

  it('locks open FIFO layers for future allocation using normalized tenant, branch, and product scope', async () => {
    const { service, store } = createService();
    const client = createNoopDatabaseClient();

    store.lockedCandidates = [
      {
        id: ORIGINAL_SOURCE_LAYER_ID,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityReceived: '10.000',
        remainingQuantity: '8.000',
        unitCost: '100.00',
        sourceTransactionType: FIFO_LAYER_SOURCE_TRANSACTION_TYPES.PURCHASE_RECEIVE,
        sourceTransactionId: SOURCE_ID,
        receivedAt: NOW,
        originalSourceLayerId: null,
        activeReservedQuantity: '2.000',
        allocatableQuantity: '6.000',
      },
    ];

    const candidates = await service.lockOpenLayersForAllocation(
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
      client,
    );

    expect(store.lockInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(store.lockClients[0]).toBe(client);
    expect(candidates).toEqual(store.lockedCandidates);
  });

  it('rejects unsupported FIFO layer source transaction types', async () => {
    const { service } = createService();

    await expect(
      service.createLayer({
        ...createCommand(),
        sourceTransactionType: INVENTORY_TRANSACTION_TYPES.JOB_ORDER_CONSUMPTION,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'source_transaction_type',
          code: 'unsupported_fifo_layer_source_transaction_type',
        },
      ],
    });
  });

  it('rejects zero received quantity', async () => {
    const { service } = createService();

    await expect(
      service.createLayer({
        ...createCommand(),
        quantityReceived: '0',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'quantity_received',
          code: 'quantity_must_be_positive',
        },
      ],
    });
  });

  it('rejects received quantities with more than 3 decimals', async () => {
    const { service } = createService();

    await expect(
      service.createLayer({
        ...createCommand(),
        quantityReceived: '1.0001',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'quantity_received',
          code: 'invalid_quantity',
        },
      ],
    });
  });

  it('rejects negative unit costs', async () => {
    const { service } = createService();

    await expect(
      service.createLayer({
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

  it('rejects invalid original source layer IDs', async () => {
    const { service } = createService();

    await expect(
      service.createLayer({
        ...createCommand(),
        originalSourceLayerId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'original_source_layer_id',
          code: 'invalid_uuid',
        },
      ],
    });
  });
});

function createService(): {
  readonly service: FifoLayerService;
  readonly store: FakeFifoLayerStore;
} {
  const store = new FakeFifoLayerStore();

  return {
    service: new FifoLayerService(store),
    store,
  };
}

function createCommand() {
  return {
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    quantityReceived: '2.000',
    unitCost: '75.00',
    sourceTransactionType: FIFO_LAYER_SOURCE_TRANSACTION_TYPES.INVENTORY_ADJUSTMENT_INCREASE,
    sourceTransactionId: SOURCE_ID,
    receivedAt: NOW,
    originalSourceLayerId: null,
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

class FakeFifoLayerStore extends FifoLayerStore {
  readonly createInputs: CreateFifoLayerInput[] = [];
  readonly createClients: (DatabaseQueryClient | undefined)[] = [];
  readonly createdLayers: FifoLayerRecord[] = [];
  readonly lockInputs: LockOpenFifoLayersForAllocationInput[] = [];
  readonly lockClients: (DatabaseQueryClient | undefined)[] = [];
  lockedCandidates: FifoLayerAllocationCandidateRecord[] = [];

  async createLayer(
    input: CreateFifoLayerInput,
    client?: DatabaseQueryClient,
  ): Promise<FifoLayerRecord> {
    this.createInputs.push(input);
    this.createClients.push(client);

    const layer: FifoLayerRecord = {
      ...input,
    };

    this.createdLayers.push(layer);

    return layer;
  }

  async lockOpenLayersForAllocation(
    input: LockOpenFifoLayersForAllocationInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoLayerAllocationCandidateRecord[]> {
    this.lockInputs.push(input);
    this.lockClients.push(client);

    return this.lockedCandidates;
  }
}
