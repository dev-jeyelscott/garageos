import { describe, expect, it } from 'vitest';

import type { AuthSessionResponseData } from '../auth/types/auth-session';

import type { InvoiceDetail, InvoiceListItem, InvoiceStatus } from './invoice.types';
import {
  buildInvoicePaymentInput,
  canCreateDraftInvoice,
  canEnterInvoiceCancelReason,
  canUseInvoiceWriteActions,
  getInvoicePaymentBlockedReason,
  getInvoiceWorkflowBlockedReason,
  mergeUniqueInvoices,
  type InvoiceWorkflowAction,
  type NetworkStatus,
} from './invoice.ui';

describe('invoice workflow UI guards', () => {
  it('allows cancel reason input only for draft and pending invoices', () => {
    expect(canEnterInvoiceCancelReason('draft')).toBe(true);
    expect(canEnterInvoiceCancelReason('pending')).toBe(true);
    expect(canEnterInvoiceCancelReason('cancelled')).toBe(false);
    expect(canEnterInvoiceCancelReason('voided')).toBe(false);
    expect(canEnterInvoiceCancelReason('refunded')).toBe(false);
  });

  it.each(['draft', 'pending'] as const)(
    'allows cancellation for %s invoices when permission and reason are present',
    (status) => {
      const session = createSession({ permissions: ['invoices.cancel'] });
      const writeActionsAllowed = canUseInvoiceWriteActions({
        session,
        networkStatus: 'online',
      });

      expect(
        getInvoiceWorkflowBlockedReason({
          action: 'cancel',
          invoice: createInvoice({ status }),
          session,
          isOffline: false,
          writeActionsAllowed,
          reason: 'Customer requested cancellation',
        }),
      ).toBeNull();
    },
  );

  it.each(['cancelled', 'voided', 'refunded'] as const)(
    'blocks all workflow actions for final invoice status %s',
    (status) => {
      const session = createSession({
        permissions: ['invoices.issue', 'invoices.cancel', 'invoices.void'],
      });
      const writeActionsAllowed = canUseInvoiceWriteActions({
        session,
        networkStatus: 'online',
      });
      const actions: readonly InvoiceWorkflowAction[] = ['issue', 'cancel', 'void'];

      for (const action of actions) {
        expect(
          getInvoiceWorkflowBlockedReason({
            action,
            invoice: createInvoice({ status }),
            session,
            isOffline: false,
            writeActionsAllowed,
            reason: 'Workflow correction',
          }),
        ).toBe('Cancelled, voided, and refunded invoices cannot use workflow actions.');
      }
    },
  );

  it('blocks invoice workflow writes for read-only tenants', () => {
    const session = createSession({
      permissions: ['invoices.cancel'],
      readOnly: true,
    });

    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'cancel',
        invoice: createInvoice({ status: 'pending' }),
        session,
        isOffline: false,
        writeActionsAllowed: canUseInvoiceWriteActions({
          session,
          networkStatus: 'online',
        }),
        reason: 'Customer requested cancellation',
      }),
    ).toBe('This tenant is read-only. Operational invoice writes are blocked.');
  });

  it('blocks invoice workflow writes while offline', () => {
    const session = createSession({ permissions: ['invoices.cancel'] });

    expect(
      getInvoiceWorkflowBlockedReason({
        action: 'cancel',
        invoice: createInvoice({ status: 'pending' }),
        session,
        isOffline: true,
        writeActionsAllowed: canUseInvoiceWriteActions({
          session,
          networkStatus: 'offline',
        }),
        reason: 'Customer requested cancellation',
      }),
    ).toBe('Reconnect before using invoice workflow actions. Offline mode is read-only.');
  });

  it('blocks payment writes for read-only tenants', () => {
    const session = createSession({
      permissions: ['payments.create', 'receipts.read'],
      readOnly: true,
    });

    expect(
      getInvoicePaymentBlockedReason({
        invoice: createInvoice({ status: 'pending', remaining_collectible_balance: '100.00' }),
        session,
        isOffline: false,
        writeActionsAllowed: canUseInvoiceWriteActions({
          session,
          networkStatus: 'online',
        }),
        amount: '25.00',
        paymentDate: '2026-07-03',
      }),
    ).toBe('This tenant is read-only. Payment writes are blocked.');
  });

  it('blocks payment writes while offline', () => {
    const session = createSession({ permissions: ['payments.create', 'receipts.read'] });

    expect(
      getInvoicePaymentBlockedReason({
        invoice: createInvoice({ status: 'pending', remaining_collectible_balance: '100.00' }),
        session,
        isOffline: true,
        writeActionsAllowed: canUseInvoiceWriteActions({
          session,
          networkStatus: 'offline',
        }),
        amount: '25.00',
        paymentDate: '2026-07-03',
      }),
    ).toBe('Reconnect before recording payments. Offline mode is read-only.');
  });

  it.each([
    {
      permissions: ['invoices.create'],
      readOnly: false,
      networkStatus: 'online',
      expected: true,
    },
    {
      permissions: [],
      readOnly: false,
      networkStatus: 'online',
      expected: false,
    },
    {
      permissions: ['invoices.create'],
      readOnly: true,
      networkStatus: 'online',
      expected: false,
    },
    {
      permissions: ['invoices.create'],
      readOnly: false,
      networkStatus: 'offline',
      expected: false,
    },
  ] satisfies readonly {
    readonly permissions: readonly string[];
    readonly readOnly: boolean;
    readonly networkStatus: NetworkStatus;
    readonly expected: boolean;
  }[])(
    'derives New invoice CTA availability from permission, tenant lifecycle, and network state',
    ({ permissions, readOnly, networkStatus, expected }) => {
      expect(
        canCreateDraftInvoice({
          session: createSession({ permissions, readOnly }),
          networkStatus,
        }),
      ).toBe(expected);
    },
  );

  it('keeps cursor pagination load-more merges stable and de-duplicated', () => {
    const invoiceOne = createListInvoice({ id: 'invoice-1', invoice_number: 'INV-0001' });
    const invoiceTwo = createListInvoice({ id: 'invoice-2', invoice_number: 'INV-0002' });
    const invoiceTwoDuplicate = createListInvoice({
      id: 'invoice-2',
      invoice_number: 'INV-0002-DUPLICATE',
    });
    const invoiceThree = createListInvoice({ id: 'invoice-3', invoice_number: 'INV-0003' });

    expect(
      mergeUniqueInvoices([invoiceOne, invoiceTwo], [invoiceTwoDuplicate, invoiceThree]).map(
        (invoice) => invoice.invoice_number,
      ),
    ).toEqual(['INV-0001', 'INV-0002', 'INV-0003']);
  });

  it('builds payment input with trimmed optional fields', () => {
    expect(
      buildInvoicePaymentInput({
        amount: '25',
        paymentDate: '2026-07-03',
        paymentMethod: 'cash',
        referenceNumber: ' REF-001 ',
        notes: ' Paid at counter ',
      }),
    ).toEqual({
      amount: '25.00',
      payment_date: '2026-07-03',
      payment_method: 'cash',
      reference_number: 'REF-001',
      notes: 'Paid at counter',
    });
  });
});

function createSession({
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
      full_name: 'Garage User',
      email: 'garage@example.com',
      email_verified: true,
      status: 'active',
    },
    tenant: {
      id: 'tenant-1',
      business_name: 'GarageOS Test Tenant',
      status: readOnly ? 'read_only' : 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    effective_permissions: permissions,
    branches: [{ id: 'branch-1', name: 'Main Branch' }],
    tenant_wide_branch_access: true,
    effective_plan: null,
    subscription: null,
    access: {
      can_access_operational_modules: canAccessOperationalModules,
      read_only: readOnly,
    },
  };
}

function createInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    ...createListInvoice(),
    job_order_ids: [],
    lines: [],
    status_events: [],
    receipts: [],
    ...overrides,
  };
}

function createListInvoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: 'invoice-1',
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    customer_id: 'customer-1',
    customer_name: 'Customer One',
    invoice_number: 'INV-0001',
    invoice_date: '2026-07-03',
    due_date: null,
    status: 'draft' satisfies InvoiceStatus,
    tax_profile: null,
    tax_mode: null,
    vat_rate: null,
    subtotal_amount: '100.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    total_amount: '100.00',
    amount_paid: '0.00',
    amount_refunded: '0.00',
    remaining_collectible_balance: '100.00',
    discount_reason: null,
    lock_version: 1,
    created_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}
