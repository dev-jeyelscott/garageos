import { describe, expect, it, vi } from 'vitest';

import type { IdempotencyKeyRecord } from '../../../shared/idempotency/idempotency-key.store';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { AuthService } from '../../auth/application/auth.service';
import { InvoicesService } from '../application/invoices.service';
import { InvoicesController, PaymentsRefundsController } from './invoices.controller';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const REFUND_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-07-03T00:00:00.000Z');

const IDEMPOTENCY_RECORD: IdempotencyKeyRecord = {
  id: '66666666-6666-4666-8666-666666666666',
  tenantId: TENANT_ID,
  userId: USER_ID,
  endpoint: 'POST /api/v1/invoices',
  requestIntentHash: 'intent-hash',
  idempotencyKeyHash: 'key-hash',
  status: 'processing',
  responseStatusCode: null,
  responseBodyJson: null,
  lockedUntil: null,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
};

const DRAFT_RESPONSE = {
  invoice: {
    id: INVOICE_ID,
    branch_id: '77777777-7777-4777-8777-777777777777',
    customer_id: '88888888-8888-4888-8888-888888888888',
    invoice_number: 'INV-20260703-000001',
    invoice_date: '2026-07-03',
    due_date: null,
    status: 'draft' as const,
    tax_profile: 'vat_registered' as const,
    tax_mode: 'tax_exclusive' as const,
    vat_rate: '0.1200',
    subtotal_amount: '1000.00',
    discount_amount: '0.00',
    tax_amount: '120.00',
    total_amount: '1120.00',
    amount_paid: '0.00',
    amount_refunded: '0.00',
    remaining_collectible_balance: '1120.00',
    discount_reason: null,
    lock_version: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
  job_order_ids: ['99999999-9999-4999-8999-999999999999'],
  lines: [],
};

const REFUND_RESPONSE = {
  refund: {
    id: REFUND_ID,
    invoice_id: INVOICE_ID,
    payment_id: PAYMENT_ID,
    amount: '120.00',
    reason: 'Customer returned unused part.',
    collection_should_continue: true,
    close_invoice_after_refund: false,
    inventory_reversal_selected: false,
    status: 'posted' as const,
    created_at: NOW.toISOString(),
  },
  payment: {
    id: PAYMENT_ID,
    invoice_id: INVOICE_ID,
    amount: '1120.00',
    refundable_amount: '1000.00',
    payment_date: '2026-07-03',
    payment_method: 'cash' as const,
    reference_number: null,
    notes: null,
    created_at: NOW.toISOString(),
  },
  invoice: DRAFT_RESPONSE.invoice,
};

describe('InvoicesController idempotency', () => {
  it('restores the recorded HTTP status when replaying a draft invoice response', async () => {
    const { invoicesController, invoicesService, idempotencyService } = createControllers();
    const httpResponse = createHttpResponse();

    vi.mocked(idempotencyService.begin).mockResolvedValueOnce({
      type: 'replayed',
      record: {
        ...IDEMPOTENCY_RECORD,
        status: 'succeeded',
        responseStatusCode: 201,
        responseBodyJson: DRAFT_RESPONSE,
      },
      responseStatusCode: 201,
      responseBodyJson: DRAFT_RESPONSE,
    });

    const response = await invoicesController.createDraftInvoice(
      'Bearer token',
      'invoice-key',
      {
        job_order_ids: ['99999999-9999-4999-8999-999999999999'],
      },
      httpResponse,
    );

    expect(response).toEqual(DRAFT_RESPONSE);
    expect(httpResponse.status).toHaveBeenCalledWith(201);
    expect(invoicesService.createDraftInvoice).not.toHaveBeenCalled();
    expect(idempotencyService.completeSucceeded).not.toHaveBeenCalled();
  });

  it('preserves the original workflow error when idempotency failure cleanup fails', async () => {
    const { invoicesController, invoicesService, idempotencyService } = createControllers();
    const workflowError = new Error('draft failed');

    vi.mocked(invoicesService.createDraftInvoice).mockRejectedValueOnce(workflowError);
    vi.mocked(idempotencyService.completeFailed).mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(
      invoicesController.createDraftInvoice(
        'Bearer token',
        'invoice-key',
        {
          job_order_ids: ['99999999-9999-4999-8999-999999999999'],
        },
        createHttpResponse(),
      ),
    ).rejects.toBe(workflowError);

    expect(idempotencyService.completeFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDEMPOTENCY_RECORD.id }),
    );
  });
});

describe('PaymentsRefundsController idempotency', () => {
  it('wraps refund creation in the documented idempotency scope', async () => {
    const { paymentsRefundsController, invoicesService, idempotencyService } = createControllers();
    const httpResponse = createHttpResponse();
    const request = {
      amount: '120.00',
      reason: 'Customer returned unused part.',
      collection_should_continue: true,
      close_invoice_after_refund: false,
    };

    const response = await paymentsRefundsController.recordRefund(
      'Bearer token',
      'refund-key',
      PAYMENT_ID,
      request,
      httpResponse,
    );

    expect(response).toEqual(REFUND_RESPONSE);
    expect(httpResponse.status).toHaveBeenCalledWith(201);
    expect(idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: 'POST /api/v1/payments/{payment_id}/refunds',
        idempotencyKey: 'refund-key',
        requestIntent: { payment_id: PAYMENT_ID, ...request },
      }),
    );
    expect(invoicesService.recordRefund).toHaveBeenCalledWith(
      PAYMENT_ID,
      request,
      expect.any(Object),
    );
    expect(idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: IDEMPOTENCY_RECORD.id,
        responseStatusCode: 201,
        responseBodyJson: REFUND_RESPONSE,
      }),
    );
  });

  it('restores the recorded HTTP status when replaying a refund response', async () => {
    const { paymentsRefundsController, invoicesService, idempotencyService } = createControllers();
    const httpResponse = createHttpResponse();
    const request = {
      amount: '120.00',
      reason: 'Customer returned unused part.',
      collection_should_continue: true,
      close_invoice_after_refund: false,
    };

    vi.mocked(idempotencyService.begin).mockResolvedValueOnce({
      type: 'replayed',
      record: {
        ...IDEMPOTENCY_RECORD,
        status: 'succeeded',
        responseStatusCode: 201,
        responseBodyJson: REFUND_RESPONSE,
      },
      responseStatusCode: 201,
      responseBodyJson: REFUND_RESPONSE,
    });

    const response = await paymentsRefundsController.recordRefund(
      'Bearer token',
      'refund-key',
      PAYMENT_ID,
      request,
      httpResponse,
    );

    expect(response).toEqual(REFUND_RESPONSE);
    expect(httpResponse.status).toHaveBeenCalledWith(201);
    expect(invoicesService.recordRefund).not.toHaveBeenCalled();
    expect(idempotencyService.completeSucceeded).not.toHaveBeenCalled();
  });

  it('preserves the original refund error when idempotency failure cleanup fails', async () => {
    const { paymentsRefundsController, invoicesService, idempotencyService } = createControllers();
    const workflowError = new Error('refund failed');

    vi.mocked(invoicesService.recordRefund).mockRejectedValueOnce(workflowError);
    vi.mocked(idempotencyService.completeFailed).mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(
      paymentsRefundsController.recordRefund(
        'Bearer token',
        'refund-key',
        PAYMENT_ID,
        {
          amount: '120.00',
          reason: 'Customer returned unused part.',
          collection_should_continue: true,
          close_invoice_after_refund: false,
        },
        createHttpResponse(),
      ),
    ).rejects.toBe(workflowError);

    expect(idempotencyService.completeFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDEMPOTENCY_RECORD.id }),
    );
  });
});

function createControllers(): {
  readonly invoicesController: InvoicesController;
  readonly paymentsRefundsController: PaymentsRefundsController;
  readonly authService: AuthService;
  readonly invoicesService: InvoicesService;
  readonly idempotencyService: IdempotencyService;
} {
  const authService = {
    getAuthenticatedRouteSession: vi.fn(async () => ({
      tenantContextSession: createTenantSession(),
    })),
  } as unknown as AuthService;

  const invoicesService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    createDraftInvoice: vi.fn(async () => DRAFT_RESPONSE),
    recordRefund: vi.fn(async () => REFUND_RESPONSE),
  } as unknown as InvoicesService;

  const idempotencyService = {
    begin: vi.fn(async () => ({ type: 'started', record: IDEMPOTENCY_RECORD })),
    completeSucceeded: vi.fn(async () => undefined),
    completeFailed: vi.fn(async () => undefined),
  } as unknown as IdempotencyService;

  return {
    invoicesController: new InvoicesController(authService, invoicesService, idempotencyService),
    paymentsRefundsController: new PaymentsRefundsController(
      authService,
      invoicesService,
      idempotencyService,
    ),
    authService,
    invoicesService,
    idempotencyService,
  };
}

function createTenantSession(): TenantContextAuthenticatedSession {
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
    effective_permissions: ['invoices.create', 'payments.refund'],
    branches: [],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

interface PassthroughHttpResponse {
  status(statusCode: number): unknown;
}

function createHttpResponse(): PassthroughHttpResponse {
  const response: PassthroughHttpResponse = {
    status: vi.fn(),
  };

  vi.mocked(response.status).mockReturnValue(response);

  return response;
}
