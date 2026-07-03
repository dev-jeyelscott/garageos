import { describe, expect, it } from 'vitest';

import {
  buildInvoiceListSearchParams,
  normalizeInvoiceDetailPayload,
  normalizeInvoiceListPayload,
  normalizePaymentMutationPayload,
  normalizeRefundMutationPayload,
  normalizeReceiptListPayload,
} from './invoice.api';

const meta = {
  requestId: 'req_test',
  correlationId: 'corr_test',
  pagination: null,
};

const invoice = {
  id: 'invoice-1',
  branch_id: 'branch-1',
  customer_id: 'customer-1',
  invoice_number: 'INV-20260703-000001',
  invoice_date: '2026-07-03',
  due_date: '2026-07-10',
  status: 'draft',
  tax_profile: 'vat_registered',
  tax_mode: 'tax_exclusive',
  vat_rate: '12.00',
  subtotal_amount: '1000.00',
  discount_amount: '0.00',
  tax_amount: '120.00',
  total_amount: '1120.00',
  amount_paid: '0.00',
  amount_refunded: '0.00',
  remaining_collectible_balance: '1120.00',
  discount_reason: null,
  lock_version: 1,
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
};

const payment = {
  id: 'payment-1',
  invoice_id: 'invoice-1',
  amount: '560.00',
  refundable_amount: '560.00',
  payment_date: '2026-07-03',
  payment_method: 'cash',
  reference_number: 'OR-001',
  notes: 'Down payment',
  created_at: '2026-07-03T01:00:00.000Z',
};

const receipt = {
  id: 'receipt-1',
  invoice_id: 'invoice-1',
  payment_id: 'payment-1',
  receipt_number: 'RCT-20260703-000001',
  amount: '560.00',
  payment_method: 'cash',
  issued_at: '2026-07-03T01:00:00.000Z',
  refundable_amount: '0.00',
};

const refund = {
  id: 'refund-1',
  invoice_id: 'invoice-1',
  payment_id: 'payment-1',
  amount: '100.00',
  reason: 'Customer returned unused part.',
  collection_should_continue: true,
  close_invoice_after_refund: false,
  inventory_reversal_selected: false,
  status: 'posted',
  created_at: '2026-07-03T02:00:00.000Z',
};

describe('invoice api normalizers', () => {
  it('builds cursor pagination query params for invoice list requests', () => {
    const params = buildInvoiceListSearchParams({
      filters: {
        status: 'pending',
        branch_id: 'branch-1',
        customer_id: 'customer-1',
        from_date: '2026-07-01',
        to_date: '2026-07-31',
      },
      limit: 25,
      cursor: 'cursor-next-page',
    });

    expect(params.get('limit')).toBe('25');
    expect(params.get('cursor')).toBe('cursor-next-page');
    expect(params.get('status')).toBe('pending');
    expect(params.get('branch_id')).toBe('branch-1');
    expect(params.get('customer_id')).toBe('customer-1');
    expect(params.get('from_date')).toBe('2026-07-01');
    expect(params.get('to_date')).toBe('2026-07-31');
  });

  it('omits blank cursors and all-branch/all-status filters from invoice list requests', () => {
    const params = buildInvoiceListSearchParams({
      filters: {
        status: 'all',
        branch_id: 'all',
        customer_id: '',
        from_date: '',
        to_date: '',
      },
      limit: 50,
      cursor: '   ',
    });

    expect(params.get('limit')).toBe('50');
    expect(params.has('cursor')).toBe(false);
    expect(params.has('status')).toBe(false);
    expect(params.has('branch_id')).toBe(false);
    expect(params.has('customer_id')).toBe(false);
    expect(params.has('from_date')).toBe(false);
    expect(params.has('to_date')).toBe(false);
  });

  it('normalizes invoice list payloads from the documented service response', () => {
    expect(normalizeInvoiceListPayload({ invoices: [invoice] }, meta)).toMatchObject({
      invoices: [
        {
          id: 'invoice-1',
          invoice_number: 'INV-20260703-000001',
          status: 'draft',
          total_amount: '1120.00',
        },
      ],
    });
  });

  it('normalizes invoice detail payloads with lines and status events', () => {
    const detail = normalizeInvoiceDetailPayload(
      {
        invoice,
        job_order_ids: ['job-order-1'],
        lines: [
          {
            id: 'line-1',
            originating_job_order_line_id: 'job-line-1',
            line_type: 'service',
            description: 'Oil change',
            quantity: '1.000',
            unit_price: '1000.00',
            line_discount_amount: '0.00',
            allocated_invoice_discount_amount: '0.00',
            taxable_base_amount: '1000.00',
            tax_amount: '120.00',
            line_total: '1120.00',
            line_order: 0,
          },
        ],
      },
      [
        {
          id: 'event-1',
          invoice_id: 'invoice-1',
          from_status: null,
          to_status: 'draft',
          reason: 'invoice_draft_created',
          created_by_user_id: 'user-1',
          created_at: '2026-07-03T00:00:00.000Z',
        },
      ],
      [],
      { requestId: 'req_test', correlationId: 'corr_test' },
    );

    expect(detail.job_order_ids).toEqual(['job-order-1']);
    expect(detail.lines).toHaveLength(1);
    expect(detail.status_events).toHaveLength(1);
    expect(detail.receipts).toHaveLength(0);
  });

  it('normalizes payment mutation payloads with generated receipt and updated invoice', () => {
    expect(
      normalizePaymentMutationPayload(
        {
          payment,
          receipt,
          invoice: {
            ...invoice,
            status: 'partially_paid',
            amount_paid: '560.00',
            remaining_collectible_balance: '560.00',
          },
        },
        { requestId: 'req_test', correlationId: 'corr_test' },
      ),
    ).toMatchObject({
      payment: {
        id: 'payment-1',
        amount: '560.00',
        payment_method: 'cash',
      },
      receipt: {
        id: 'receipt-1',
        receipt_number: 'RCT-20260703-000001',
      },
      invoice: {
        id: 'invoice-1',
        status: 'partially_paid',
      },
    });
  });

  it('normalizes refund mutation payloads with updated payment and invoice state', () => {
    expect(
      normalizeRefundMutationPayload(
        {
          refund,
          payment: {
            ...payment,
            refundable_amount: '460.00',
          },
          invoice: {
            ...invoice,
            status: 'partially_paid',
            amount_paid: '560.00',
            amount_refunded: '100.00',
            remaining_collectible_balance: '660.00',
          },
          inventory_reversals: [],
        },
        { requestId: 'req_test', correlationId: 'corr_test' },
      ),
    ).toMatchObject({
      refund: {
        id: 'refund-1',
        amount: '100.00',
        status: 'posted',
      },
      payment: {
        id: 'payment-1',
        refundable_amount: '460.00',
      },
      invoice: {
        id: 'invoice-1',
        amount_refunded: '100.00',
      },
      inventory_reversals: [],
    });
  });

  it('normalizes receipt list payloads', () => {
    expect(
      normalizeReceiptListPayload(
        { receipts: [receipt] },
        {
          requestId: 'req_test',
          correlationId: 'corr_test',
        },
      ),
    ).toEqual([receipt]);
  });

  it('throws a stable client error for invalid invoice list payloads', () => {
    expect(() => normalizeInvoiceListPayload({ invoices: [{}] }, meta)).toThrow(
      'The invoice list response did not contain a valid invoice list payload.',
    );
  });
});
