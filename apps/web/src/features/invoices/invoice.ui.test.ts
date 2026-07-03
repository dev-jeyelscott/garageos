import { describe, expect, it } from 'vitest';

import type { AuthSessionResponseData } from '../auth/types/auth-session';

import {
  buildInvoiceRefundInput,
  getInvoiceRefundBlockedReason,
  getInvoiceWorkflowBlockedReason,
  getReceiptRefundableEstimate,
} from './invoice.ui';
import type { InvoiceDetail, InvoiceReceipt } from './invoice.types';

const session = {
  access: {
    can_access_operational_modules: true,
    read_only: false,
  },
  effective_permissions: ['invoices.read', 'invoices.void', 'payments.refund'],
} as unknown as AuthSessionResponseData;

const invoice = {
  id: 'invoice-1',
  branch_id: 'branch-1',
  branch_name: null,
  customer_id: 'customer-1',
  customer_name: null,
  invoice_number: 'INV-20260703-000001',
  invoice_date: '2026-07-03',
  due_date: '2026-07-10',
  status: 'paid',
  tax_profile: 'vat_registered',
  tax_mode: 'tax_exclusive',
  vat_rate: '12.00',
  subtotal_amount: '1000.00',
  discount_amount: '0.00',
  tax_amount: '120.00',
  total_amount: '1120.00',
  amount_paid: '1120.00',
  amount_refunded: '0.00',
  remaining_collectible_balance: '0.00',
  discount_reason: null,
  lock_version: 1,
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
  job_order_ids: ['job-order-1'],
  lines: [],
  status_events: [],
  receipts: [],
} satisfies InvoiceDetail;

const receipt = {
  id: 'receipt-1',
  invoice_id: 'invoice-1',
  payment_id: 'payment-1',
  receipt_number: 'RCT-20260703-000001',
  amount: '1120.00',
  payment_method: 'cash',
  issued_at: '2026-07-03T00:30:00.000Z',
} satisfies InvoiceReceipt;

describe('invoice UI guards', () => {
  it('blocks voiding paid invoices until payment amounts are fully refunded', () => {
    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'void',
        invoice,
        session,
        isOffline: false,
        writeActionsAllowed: true,
        reason: 'Incorrect invoice.',
      }),
    ).toBe('Paid invoices must be fully refunded before voiding.');
  });

  it('limits refund amount to a conservative receipt-level refundable estimate', () => {
    expect(getReceiptRefundableEstimate({ invoice, receipt })).toBe(1120);

    expect(
      getInvoiceRefundBlockedReason({
        invoice,
        receipt,
        session,
        isOffline: false,
        writeActionsAllowed: true,
        amount: '1120.01',
        reason: 'Customer returned unused part.',
      }),
    ).toBe('Refund amount cannot exceed the available refundable amount for this payment.');
  });

  it('builds a documented refund payload with reason and collection flags', () => {
    expect(
      buildInvoiceRefundInput({
        amount: '100',
        reason: '  Customer returned unused part.  ',
        collectionShouldContinue: true,
        closeInvoiceAfterRefund: false,
      }),
    ).toEqual({
      amount: '100.00',
      reason: 'Customer returned unused part.',
      collection_should_continue: true,
      close_invoice_after_refund: false,
    });
  });
});
