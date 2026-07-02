import { describe, expect, it, vi } from 'vitest';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { AuthService } from '../../auth/application/auth.service';
import type {
  PurchaseOrderDraftService,
  PurchaseOrderMutationResponse,
} from '../application/purchase-order-draft.service';
import type { PurchaseOrderLifecycleService } from '../application/purchase-order-lifecycle.service';
import type { PurchaseOrderQueryService } from '../application/purchase-order-query.service';
import type {
  PurchaseReceivingResponse,
  ReceivePurchaseOrderService,
} from '../application/receive-purchase-order.service';
import { PurchaseOrdersController } from './purchase-orders.controller';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const LINE_ID = '66666666-6666-4666-8666-666666666666';

const purchaseOrderQueryService = {
  listPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
} as unknown as PurchaseOrderQueryService;

const purchaseOrderLifecycleService = {
  getIdempotencyExpiresAt: getExpiresAt,
} as unknown as PurchaseOrderLifecycleService;

function buildSession() {
  return {
    tenantContextSession: {
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
      effective_permissions: ['purchases.create', 'purchases.update', 'purchases.receive'],
      branches: [],
      tenant_wide_branch_access: true,
      subscription_status_source: 'system_computed',
    },
  };
}

const receivingResponse: PurchaseReceivingResponse = {
  purchase_order_id: PURCHASE_ORDER_ID,
  receiving_id: '77777777-7777-4777-8777-777777777777',
  status: 'partially_received',
  fifo_layer_ids: ['88888888-8888-4888-8888-888888888888'],
  inventory_ledger_entry_ids: ['99999999-9999-4999-8999-999999999999'],
  ap_effect: {
    created: true,
    supplier_payable_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    amount_delta: '500.00',
  },
  lines: [],
};

const purchaseOrderResponse: PurchaseOrderMutationResponse = {
  purchase_order: {
    id: PURCHASE_ORDER_ID,
    purchase_order_number: 'PO-20260702-000001',
    status: 'draft',
    payment_terms: 'credit',
    branch_id: BRANCH_ID,
    branch_name: 'Main Branch',
    supplier_id: SUPPLIER_ID,
    supplier_name: 'Acme Parts',
    order_date: '2026-07-02',
    expected_receive_date: '2026-07-05',
    ordered_total_amount: '500.00',
    received_total_amount: '0.00',
    ordered_line_count: 1,
    received_line_count: 0,
    lock_version: 0,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    line_items: [],
    receiving_status_summary: [],
  },
};

describe('PurchaseOrdersController', () => {
  it('wraps purchase order create with idempotency', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = buildReceivePurchaseOrderService();
    const purchaseOrderDraftService = {
      getIdempotencyExpiresAt: getExpiresAt,
      createPurchaseOrder: async () => {
        calls.push('create');

        return purchaseOrderResponse;
      },
    } as unknown as PurchaseOrderDraftService;

    const idempotencyService = {
      begin: async () => ({
        type: 'started',
        record: {
          id: 'idem-id',
        },
      }),
      completeSucceeded: async () => {
        calls.push('completeSucceeded');
      },
      completeFailed: async () => {
        calls.push('completeFailed');
      },
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      purchaseOrderDraftService,
      purchaseOrderLifecycleService,
      receivePurchaseOrderService,
      idempotencyService,
    );

    await expect(
      controller.createPurchaseOrder('Bearer token', 'po-create-idempotency-key', {
        branch_id: BRANCH_ID,
        supplier_id: SUPPLIER_ID,
        payment_terms: 'credit',
        order_date: '2026-07-02',
        expected_receive_date: '2026-07-05',
        lines: [
          {
            product_id: PRODUCT_ID,
            ordered_quantity: '5.000',
            unit_cost: '100.00',
          },
        ],
      }),
    ).resolves.toEqual(purchaseOrderResponse);

    expect(calls).toEqual(['create', 'completeSucceeded']);
  });

  it('updates purchase order drafts without idempotency wrapping', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const purchaseOrderDraftService = {
      updatePurchaseOrder: async () => {
        calls.push('update');

        return purchaseOrderResponse;
      },
    } as unknown as PurchaseOrderDraftService;

    const idempotencyService = {
      begin: async () => {
        calls.push('begin');
      },
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      purchaseOrderDraftService,
      purchaseOrderLifecycleService,
      buildReceivePurchaseOrderService(),
      idempotencyService,
    );

    await expect(
      controller.updatePurchaseOrder(
        'Bearer token',
        { purchase_order_id: PURCHASE_ORDER_ID },
        {
          branch_id: BRANCH_ID,
          supplier_id: SUPPLIER_ID,
          payment_terms: 'credit',
          order_date: '2026-07-02',
          expected_receive_date: '2026-07-05',
          lines: [
            {
              product_id: PRODUCT_ID,
              ordered_quantity: '5.000',
              unit_cost: '100.00',
            },
          ],
          lock_version: 0,
        },
      ),
    ).resolves.toEqual(purchaseOrderResponse);

    expect(calls).toEqual(['update']);
  });

  it('wraps purchase receiving with idempotency', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: getExpiresAt,
      receive: async () => {
        calls.push('receive');

        return receivingResponse;
      },
    } as unknown as ReceivePurchaseOrderService;

    const idempotencyService = {
      begin: async () => ({
        type: 'started',
        record: {
          id: 'idem-id',
        },
      }),
      completeSucceeded: async () => {
        calls.push('completeSucceeded');
      },
      completeFailed: async () => {
        calls.push('completeFailed');
      },
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      {} as unknown as PurchaseOrderDraftService,
      purchaseOrderLifecycleService,
      receivePurchaseOrderService,
      idempotencyService,
    );

    await expect(
      controller.receivePurchaseOrder(
        'Bearer token',
        'po-receive-idempotency-key',
        { purchase_order_id: PURCHASE_ORDER_ID },
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '5.000',
              received_unit_cost: '100.00',
            },
          ],
        },
      ),
    ).resolves.toEqual(receivingResponse);

    expect(calls).toEqual(['receive', 'completeSucceeded']);
  });

  it('returns replayed idempotency response without running the service again', async () => {
    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: getExpiresAt,
      receive: async () => {
        throw new Error('receive should not run for replayed idempotency responses.');
      },
    } as unknown as ReceivePurchaseOrderService;

    const idempotencyService = {
      begin: async () => ({
        type: 'replayed',
        record: {
          id: 'idem-id',
        },
        responseStatusCode: 201,
        responseBodyJson: receivingResponse,
      }),
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      {} as unknown as PurchaseOrderDraftService,
      purchaseOrderLifecycleService,
      receivePurchaseOrderService,
      idempotencyService,
    );

    await expect(
      controller.receivePurchaseOrder(
        'Bearer token',
        'po-receive-idempotency-key',
        { purchase_order_id: PURCHASE_ORDER_ID },
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '5.000',
              received_unit_cost: '100.00',
            },
          ],
        },
      ),
    ).resolves.toEqual(receivingResponse);
  });

  it('propagates idempotency conflicts without running the receiving service', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: getExpiresAt,
      receive: async () => {
        calls.push('receive');

        return receivingResponse;
      },
    } as unknown as ReceivePurchaseOrderService;

    const idempotencyService = {
      begin: async () => {
        throw GarageOsApiException.idempotencyConflict();
      },
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      {} as unknown as PurchaseOrderDraftService,
      purchaseOrderLifecycleService,
      receivePurchaseOrderService,
      idempotencyService,
    );

    await expect(
      controller.receivePurchaseOrder(
        'Bearer token',
        'po-receive-idempotency-key',
        { purchase_order_id: PURCHASE_ORDER_ID },
        {
          lines: [
            {
              purchase_order_line_id: LINE_ID,
              received_quantity: '5.000',
              received_unit_cost: '100.00',
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });

    expect(calls).toEqual([]);
  });
});

function buildReceivePurchaseOrderService(): ReceivePurchaseOrderService {
  return {
    getIdempotencyExpiresAt: getExpiresAt,
    receive: async () => receivingResponse,
  } as unknown as ReceivePurchaseOrderService;
}

function getExpiresAt(now: Date): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
