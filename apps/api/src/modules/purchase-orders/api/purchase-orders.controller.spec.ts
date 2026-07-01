import { describe, expect, it } from 'vitest';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { AuthService } from '../../auth/application/auth.service';
import type {
  PurchaseReceivingResponse,
  ReceivePurchaseOrderService,
} from '../application/receive-purchase-order.service';
import { PurchaseOrdersController } from './purchase-orders.controller';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';

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
      effective_permissions: ['purchases.receive'],
      branches: [],
      tenant_wide_branch_access: true,
      subscription_status_source: 'system_computed',
    },
  };
}

const response: PurchaseReceivingResponse = {
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

describe('PurchaseOrdersController', () => {
  it('wraps purchase receiving with idempotency', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000),
      receive: async () => {
        calls.push('receive');

        return response;
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
    ).resolves.toEqual(response);

    expect(calls).toEqual(['receive', 'completeSucceeded']);
  });

  it('returns replayed idempotency response without running the service again', async () => {
    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000),
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
        responseBodyJson: response,
      }),
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
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
    ).resolves.toEqual(response);
  });

  it('propagates idempotency conflicts without running the receiving service', async () => {
    const calls: string[] = [];

    const authService = {
      getAuthenticatedRouteSession: async () => buildSession(),
    } as unknown as AuthService;

    const receivePurchaseOrderService = {
      getIdempotencyExpiresAt: (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000),
      receive: async () => {
        calls.push('receive');

        return response;
      },
    } as unknown as ReceivePurchaseOrderService;

    const idempotencyService = {
      begin: async () => {
        throw GarageOsApiException.idempotencyConflict();
      },
    } as unknown as IdempotencyService;

    const controller = new PurchaseOrdersController(
      authService,
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
