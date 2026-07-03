import { describe, expect, it } from 'vitest';

import type { AuthSessionResponseData } from '../auth/types/auth-session';

import {
  canEnterInvoiceCancelReason,
  getInvoiceRefundBlockedReason,
  getInvoiceRefundFormBlockedReason,
  getInvoiceWorkflowBlockedReason,
} from './invoice.ui';
import type { InvoiceDetail, InvoiceReceipt, InvoiceStatus } from './invoice.types';

function buildSession({
  permissions,
  readOnly = false,
  canAccessOperationalModules = true,
}: {
  readonly permissions: readonly string[];
  readonly readOnly?: boolean;
  readonly canAccessOperationalModules?: boolean;
}): AuthSessionResponseData {
  return {
    user: {
      id: 'user-1',
      user_type: 'tenant_user',
      full_name: 'Cashier User',
      email: 'cashier@example.com',
      email_verified: true,
      status: 'active',
    },
    tenant: {
      id: 'tenant-1',
      business_name: 'Test Garage',
      status: readOnly ? 'read_only' : 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    effective_permissions: permissions,
    branches: [{ id: 'branch-1', name: 'Main Branch' }],
    tenant_wide_branch_access: true,
    effective_plan: {
      code: 'high',
      name: 'High',
      limits: {
        max_active_branches: 10,
        customer_email_reminders: true,
        customer_sms_reminders: true,
      },
    },
    subscription: {
      status: readOnly ? 'read_only' : 'active',
      expiration_date: '2026-12-31',
      days_until_expiration: 180,
      renewal_required: readOnly,
    },
    access: {
      can_access_operational_modules: canAccessOperationalModules,
      read_only: readOnly,
    },
  };
}

const refundReceipt: InvoiceReceipt = {
  id: 'receipt-1',
  invoice_id: 'invoice-1',
  payment_id: 'payment-1',
  receipt_number: 'RCT-20260704-000001',
  amount: '1000.00',
  payment_method: 'cash',
  issued_at: '2026-07-04T01:00:00.000Z',
};

function buildInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'invoice-1',
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    customer_id: 'customer-1',
    customer_name: 'Juan Rider',
    invoice_number: 'INV-20260704-000001',
    invoice_date: '2026-07-04',
    due_date: '2026-07-11',
    status: 'pending',
    tax_profile: 'vat_registered',
    tax_mode: 'tax_exclusive',
    vat_rate: '12.00',
    subtotal_amount: '892.86',
    discount_amount: '0.00',
    tax_amount: '107.14',
    total_amount: '1000.00',
    amount_paid: '1000.00',
    amount_refunded: '0.00',
    remaining_collectible_balance: '0.00',
    discount_reason: null,
    lock_version: 1,
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
    job_order_ids: ['job-order-1'],
    lines: [],
    status_events: [],
    receipts: [refundReceipt],
    ...overrides,
  };
}

const workflowSession = buildSession({
  permissions: ['invoices.issue', 'invoices.cancel', 'invoices.void'],
});

const refundSession = buildSession({
  permissions: ['payments.refund'],
});

describe('canEnterInvoiceCancelReason', () => {
  it.each<InvoiceStatus>(['draft', 'pending'])(
    'allows cancel reason entry for %s invoices',
    (status) => {
      expect(canEnterInvoiceCancelReason(status)).toBe(true);
    },
  );

  it.each<InvoiceStatus>(['partially_paid', 'paid', 'overdue', 'cancelled', 'voided', 'refunded'])(
    'blocks cancel reason entry for %s invoices',
    (status) => {
      expect(canEnterInvoiceCancelReason(status)).toBe(false);
    },
  );
});

describe('invoice workflow action guards', () => {
  it('requires a reason before voiding an issued invoice', () => {
    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'void',
        invoice: buildInvoice({ amount_paid: '0.00', amount_refunded: '0.00' }),
        session: workflowSession,
        isOffline: false,
        writeActionsAllowed: true,
        reason: '   ',
      }),
    ).toBe('A reason is required for this invoice workflow action.');
  });

  it('blocks voiding a paid invoice until payments are fully refunded', () => {
    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'void',
        invoice: buildInvoice({
          status: 'paid',
          amount_paid: '1000.00',
          amount_refunded: '500.00',
        }),
        session: workflowSession,
        isOffline: false,
        writeActionsAllowed: true,
        reason: 'Payment correction.',
      }),
    ).toBe('Paid invoices must be fully refunded before voiding.');
  });

  it('allows voiding a paid invoice after payments are fully refunded', () => {
    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'void',
        invoice: buildInvoice({
          status: 'paid',
          amount_paid: '1000.00',
          amount_refunded: '1000.00',
        }),
        session: workflowSession,
        isOffline: false,
        writeActionsAllowed: true,
        reason: 'Fully refunded correction.',
      }),
    ).toBeNull();
  });
});

describe('invoice refund guards', () => {
  it('keeps refund amount and reason editable while field validation is blocked', () => {
    const invoice = buildInvoice();

    expect(
      getInvoiceRefundFormBlockedReason({
        invoice,
        receipt: refundReceipt,
        session: refundSession,
        isOffline: false,
        writeActionsAllowed: true,
      }),
    ).toBeNull();

    expect(
      getInvoiceRefundBlockedReason({
        invoice,
        receipt: refundReceipt,
        session: refundSession,
        isOffline: false,
        writeActionsAllowed: true,
        amount: '100.00',
        reason: '   ',
      }),
    ).toBe('Refund reason is required.');
  });

  it('blocks refund input editing while offline', () => {
    expect(
      getInvoiceRefundFormBlockedReason({
        invoice: buildInvoice(),
        receipt: refundReceipt,
        session: refundSession,
        isOffline: true,
        writeActionsAllowed: false,
      }),
    ).toBe('Reconnect before recording refunds. Offline mode is read-only.');
  });

  it('blocks refund input editing for read-only tenant sessions', () => {
    expect(
      getInvoiceRefundFormBlockedReason({
        invoice: buildInvoice(),
        receipt: refundReceipt,
        session: buildSession({ permissions: ['payments.refund'], readOnly: true }),
        isOffline: false,
        writeActionsAllowed: false,
      }),
    ).toBe('This tenant is read-only. Refund writes are blocked.');
  });

  it('blocks refunding final invoice statuses', () => {
    expect(
      getInvoiceRefundFormBlockedReason({
        invoice: buildInvoice({ status: 'refunded' }),
        receipt: refundReceipt,
        session: refundSession,
        isOffline: false,
        writeActionsAllowed: true,
      }),
    ).toBe('Only issued invoices with refundable payments can receive refunds.');
  });

  it('blocks refund amounts above the available refundable amount', () => {
    expect(
      getInvoiceRefundBlockedReason({
        invoice: buildInvoice({ amount_paid: '1000.00', amount_refunded: '900.00' }),
        receipt: refundReceipt,
        session: refundSession,
        isOffline: false,
        writeActionsAllowed: true,
        amount: '150.00',
        reason: 'Customer returned unused part.',
      }),
    ).toBe('Refund amount cannot exceed the available refundable amount for this payment.');
  });
});
