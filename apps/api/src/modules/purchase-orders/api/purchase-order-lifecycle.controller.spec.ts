import { describe, expect, it, vi } from 'vitest';

import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { AuthService } from '../../auth/application/auth.service';
import type {
  PurchaseOrderDraftService,
  PurchaseOrderMutationResponse,
} from '../application/purchase-order-draft.service';
import type { PurchaseOrderLifecycleService } from '../application/purchase-order-lifecycle.service';
import type { ReceivePurchaseOrderService } from '../application/receive-purchase-order.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import type { PurchaseOrderQueryService } from '../application/purchase-order-query.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';

const purchaseOrderQueryService = {
  listPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
} as unknown as PurchaseOrderQueryService;

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
      effective_permissions: ['purchases.update', 'purchases.cancel'],
      branches: [],
      tenant_wide_branch_access: true,
      subscription_status_source: 'system_computed',
    },
  };
}

const lifecycleResponse: PurchaseOrderMutationResponse = {
  purchase_order: {
    id: PURCHASE_ORDER_ID,
    purchase_order_number: 'PO-20260702-000001',
    status: 'ordered',
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
    lock_version: 1,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T01:00:00.000Z',
    line_items: [],
    receiving_status_summary: [],
  },
};

describe('PurchaseOrdersController lifecycle actions', () => {
  it('wraps order action with idempotency', async () => {
    const calls: string[] = [];
    const controller = buildController({
      idempotencyService: buildStartedIdempotencyService(calls),
      lifecycleService: {
        getIdempotencyExpiresAt: getExpiresAt,
        orderPurchaseOrder: async () => {
          calls.push('order');

          return lifecycleResponse;
        },
      } as unknown as PurchaseOrderLifecycleService,
    });

    await expect(
      controller.orderPurchaseOrder('Bearer token', 'po-order-idempotency-key', {
        purchase_order_id: PURCHASE_ORDER_ID,
      }),
    ).resolves.toEqual(lifecycleResponse);

    expect(calls).toEqual(['order', 'completeSucceeded']);
  });

  it('wraps cancel action with idempotency', async () => {
    const calls: string[] = [];
    const controller = buildController({
      idempotencyService: buildStartedIdempotencyService(calls),
      lifecycleService: {
        getIdempotencyExpiresAt: getExpiresAt,
        cancelPurchaseOrder: async () => {
          calls.push('cancel');

          return lifecycleResponse;
        },
      } as unknown as PurchaseOrderLifecycleService,
    });

    await expect(
      controller.cancelPurchaseOrder(
        'Bearer token',
        'po-cancel-idempotency-key',
        { purchase_order_id: PURCHASE_ORDER_ID },
        { reason: 'Supplier cancelled availability.' },
      ),
    ).resolves.toEqual(lifecycleResponse);

    expect(calls).toEqual(['cancel', 'completeSucceeded']);
  });

  it('wraps close action with idempotency', async () => {
    const calls: string[] = [];
    const controller = buildController({
      idempotencyService: buildStartedIdempotencyService(calls),
      lifecycleService: {
        getIdempotencyExpiresAt: getExpiresAt,
        closePurchaseOrder: async () => {
          calls.push('close');

          return lifecycleResponse;
        },
      } as unknown as PurchaseOrderLifecycleService,
    });

    await expect(
      controller.closePurchaseOrder('Bearer token', 'po-close-idempotency-key', {
        purchase_order_id: PURCHASE_ORDER_ID,
      }),
    ).resolves.toEqual(lifecycleResponse);

    expect(calls).toEqual(['close', 'completeSucceeded']);
  });

  it('returns replayed lifecycle idempotency responses without running the service again', async () => {
    const controller = buildController({
      idempotencyService: {
        begin: async () => ({
          type: 'replayed',
          record: {
            id: 'idem-id',
          },
          responseStatusCode: 200,
          responseBodyJson: lifecycleResponse,
        }),
      } as unknown as IdempotencyService,
      lifecycleService: {
        getIdempotencyExpiresAt: getExpiresAt,
        orderPurchaseOrder: async () => {
          throw new Error('order should not run for replayed idempotency responses.');
        },
      } as unknown as PurchaseOrderLifecycleService,
    });

    await expect(
      controller.orderPurchaseOrder('Bearer token', 'po-order-idempotency-key', {
        purchase_order_id: PURCHASE_ORDER_ID,
      }),
    ).resolves.toEqual(lifecycleResponse);
  });
});

function buildController(options: {
  readonly idempotencyService: IdempotencyService;
  readonly lifecycleService: PurchaseOrderLifecycleService;
}): PurchaseOrdersController {
  const authService = {
    getAuthenticatedRouteSession: async () => buildSession(),
  } as unknown as AuthService;

  const receivePurchaseOrderService = {
    getIdempotencyExpiresAt: getExpiresAt,
  } as unknown as ReceivePurchaseOrderService;

  const purchaseOrderDraftService = {} as unknown as PurchaseOrderDraftService;

  return new PurchaseOrdersController(
    authService,
    purchaseOrderQueryService,
    purchaseOrderDraftService,
    options.lifecycleService,
    receivePurchaseOrderService,
    options.idempotencyService,
  );
}

function buildStartedIdempotencyService(calls: string[]): IdempotencyService {
  return {
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
}

function getExpiresAt(now: Date): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
