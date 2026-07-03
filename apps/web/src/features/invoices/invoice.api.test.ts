import { describe, expect, it } from 'vitest';

import { normalizeInvoiceDetailPayload, normalizeInvoiceListPayload } from './invoice.api';

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

describe('invoice api normalizers', () => {
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
      { requestId: 'req_test', correlationId: 'corr_test' },
    );

    expect(detail.job_order_ids).toEqual(['job-order-1']);
    expect(detail.lines).toHaveLength(1);
    expect(detail.status_events).toHaveLength(1);
  });

  it('throws a stable client error for invalid invoice list payloads', () => {
    expect(() => normalizeInvoiceListPayload({ invoices: [{}] }, meta)).toThrow(
      'The invoice list response did not contain a valid invoice list payload.',
    );
  });
});
