import { describe, expect, it } from 'vitest';

import type { AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import {
  BILLING_ALLOCATION_STATUSES,
  type InvoiceBillingAllocationRecord,
  type InvoiceJobOrderRecord,
  type InvoiceLineRecord,
  type InvoicePaymentRecord,
  type InvoiceReceiptRecord,
  type InvoiceRecord,
  type InvoiceStatusEventRecord,
  type InvoiceWithDetailsRecord,
} from './invoice.records';
import {
  InvoiceStore,
  type BillingAllocationTotalRecord,
  type CreateDraftInvoiceInput,
  type CreateInvoiceBillingAllocationsInput,
  type CreateInvoiceJobOrderLinksInput,
  type CreateInvoiceLinesInput,
  type CreateInvoicePaymentInput,
  type CreateInvoiceReceiptInput,
  type FindLatestInvoiceNumberForDateInput,
  type InsertInvoiceStatusEventInput,
  type InvoiceDraftJobOrderLineRecord,
  type InvoiceDraftJobOrderRecord,
  type InvoiceSettingsRecord,
  type ListInvoicesInput,
  type UpdateInvoicePaymentTotalsInput,
  type UpdateBillingAllocationStatusesInput,
  type UpdateInvoiceWorkflowStatusInput,
} from './invoice.store';
import { InvoicesService } from './invoices.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const jobOrderId = '55555555-5555-4555-8555-555555555555';
const jobOrderLineId = '66666666-6666-4666-8666-666666666666';
const createdAt = new Date('2026-07-02T00:00:00.000Z');

describe('InvoicesService', () => {
  it('creates a draft invoice from eligible job order lines with reserved allocations', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);

    const result = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    expect(result.invoice).toMatchObject({
      branch_id: branchId,
      customer_id: customerId,
      invoice_number: 'INV-20260702-000001',
      status: 'draft',
      subtotal_amount: '1000.00',
      discount_amount: '0.00',
      tax_amount: '120.00',
      total_amount: '1120.00',
      remaining_collectible_balance: '1120.00',
    });
    expect(store.createdInvoice?.status).toBe('draft');
    expect(store.createdAllocations[0]).toMatchObject({
      jobOrderLineId,
      allocatedQuantity: '1.000',
      status: BILLING_ALLOCATION_STATUSES.RESERVED,
    });
    expect(store.statusEvents[0]).toMatchObject({
      toStatus: 'draft',
      reason: 'invoice_draft_created',
    });
  });

  it('persists invoice-level fixed discount allocation and recalculated totals', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);

    const result = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
        invoice_level_discount: {
          type: 'fixed',
          amount: '100.00',
          reason: 'Loyal customer discount.',
        },
      },
      createSession(),
    );

    expect(result.invoice).toMatchObject({
      subtotal_amount: '1000.00',
      discount_amount: '100.00',
      tax_amount: '108.00',
      total_amount: '1008.00',
      remaining_collectible_balance: '1008.00',
      discount_reason: 'Loyal customer discount.',
    });
    expect(result.lines[0]).toMatchObject({
      line_discount_amount: '0.00',
      allocated_invoice_discount_amount: '100.00',
      taxable_base_amount: '900.00',
      tax_amount: '108.00',
      line_total: '1008.00',
    });
  });

  it('persists invoice-level percentage discount allocation and recalculated totals', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);

    const result = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
        invoice_level_discount: {
          type: 'percentage',
          percentage: '10',
          reason: 'Promo discount.',
        },
      },
      createSession(),
    );

    expect(result.invoice).toMatchObject({
      subtotal_amount: '1000.00',
      discount_amount: '100.00',
      tax_amount: '108.00',
      total_amount: '1008.00',
      remaining_collectible_balance: '1008.00',
      discount_reason: 'Promo discount.',
    });
    expect(result.lines[0]).toMatchObject({
      allocated_invoice_discount_amount: '100.00',
      taxable_base_amount: '900.00',
      tax_amount: '108.00',
      line_total: '1008.00',
    });
  });

  it('calculates draft invoice totals using tax-inclusive tenant tax settings', async () => {
    const store = new FakeInvoiceStore();
    store.invoiceSettings = {
      ...store.invoiceSettings,
      taxMode: 'tax_inclusive',
    };
    store.jobOrderLines = [
      {
        ...createDefaultJobOrderLine(),
        unitPrice: '1120.00',
        authorizedAmount: '1120.00',
      },
    ];
    const service = createService(store);

    const result = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    expect(result.invoice).toMatchObject({
      subtotal_amount: '1120.00',
      discount_amount: '0.00',
      tax_amount: '120.00',
      total_amount: '1120.00',
      remaining_collectible_balance: '1120.00',
    });
    expect(result.lines[0]).toMatchObject({
      taxable_base_amount: '1000.00',
      tax_amount: '120.00',
      line_total: '1120.00',
    });
  });

  it('calculates draft invoice totals using no-tax tenant settings', async () => {
    const store = new FakeInvoiceStore();
    store.invoiceSettings = {
      ...store.invoiceSettings,
      taxProfile: 'non_vat',
      taxMode: 'no_tax',
    };
    const service = createService(store);

    const result = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    expect(result.invoice).toMatchObject({
      subtotal_amount: '1000.00',
      discount_amount: '0.00',
      tax_amount: '0.00',
      total_amount: '1000.00',
      remaining_collectible_balance: '1000.00',
    });
    expect(result.lines[0]).toMatchObject({
      taxable_base_amount: '1000.00',
      tax_amount: '0.00',
      line_total: '1000.00',
    });
  });

  it('blocks draft creation when selected lines are already fully reserved', async () => {
    const store = new FakeInvoiceStore();
    store.allocationTotals = [
      {
        jobOrderLineId,
        allocatedQuantity: '1.000',
        allocatedAmount: '0.00',
      },
    ];
    const service = createService(store);

    await expect(
      service.createDraftInvoice(
        {
          job_order_ids: [jobOrderId],
          invoice_date: createdAt,
        },
        createSession(),
      ),
    ).rejects.toMatchObject({
      code: 'invoice_overbilling_blocked',
    });

    expect(store.createdInvoice).toBeNull();
  });

  it('blocks draft creation when invoice-level discount exceeds eligible subtotal', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);

    await expect(
      service.createDraftInvoice(
        {
          job_order_ids: [jobOrderId],
          invoice_date: createdAt,
          invoice_level_discount: {
            type: 'fixed',
            amount: '1000.01',
            reason: 'Invalid discount test.',
          },
        },
        createSession(),
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [
        expect.objectContaining({
          code: 'invoice_discount_exceeds_eligible_subtotal',
        }),
      ],
    });

    expect(store.createdInvoice).toBeNull();
  });

  it('blocks draft creation when insert-time allocation protection detects overbilling', async () => {
    const store = new FakeInvoiceStore();
    store.createBillingAllocationsResult = [];
    const service = createService(store);

    await expect(
      service.createDraftInvoice(
        {
          job_order_ids: [jobOrderId],
          invoice_date: createdAt,
        },
        createSession(),
      ),
    ).rejects.toMatchObject({
      code: 'invoice_overbilling_blocked',
    });
  });

  it('issues a draft invoice and finalizes reserved billing allocations', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    const issued = await service.issueInvoice(draft.invoice.id, {}, createSession());

    expect(issued.invoice.status).toBe('pending');
    expect(store.createdInvoice).toMatchObject({
      status: 'pending',
      issuedAt: expect.any(Date),
    });
    expect(store.createdAllocations[0]?.status).toBe(BILLING_ALLOCATION_STATUSES.FINAL);
    expect(store.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'pending',
      reason: 'invoice_issued',
    });
  });

  it('cancels a draft invoice and releases billing allocations with a reason', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    const cancelled = await service.cancelInvoice(
      draft.invoice.id,
      { reason: 'Customer cancelled the service billing.' },
      createSession(),
    );

    expect(cancelled.invoice.status).toBe('cancelled');
    expect(store.createdInvoice).toMatchObject({
      status: 'cancelled',
      cancelledAt: expect.any(Date),
    });
    expect(store.createdAllocations[0]?.status).toBe(BILLING_ALLOCATION_STATUSES.RELEASED);
    expect(store.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'draft',
      toStatus: 'cancelled',
      reason: 'Customer cancelled the service billing.',
    });
  });

  it('voids an issued unpaid invoice and releases finalized billing allocations', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );
    await service.issueInvoice(draft.invoice.id, {}, createSession());

    const voided = await service.voidInvoice(
      draft.invoice.id,
      { reason: 'Invoice issued in error.' },
      createSession(),
    );

    expect(voided.invoice.status).toBe('voided');
    expect(store.createdInvoice).toMatchObject({
      status: 'voided',
      voidedAt: expect.any(Date),
    });
    expect(store.createdAllocations[0]?.status).toBe(BILLING_ALLOCATION_STATUSES.RELEASED);
    expect(store.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'pending',
      toStatus: 'voided',
      reason: 'Invoice issued in error.',
    });
  });

  it('blocks voiding when invoice payments are not fully refunded', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );
    await service.issueInvoice(draft.invoice.id, {}, createSession());
    store.setPaymentSnapshot({
      amountPaid: '500.00',
      amountRefunded: '0.00',
    });

    await expect(
      service.voidInvoice(
        draft.invoice.id,
        { reason: 'Attempt void with active payment.' },
        createSession(),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [
        expect.objectContaining({
          code: 'invoice_void_blocked_by_unrefunded_payments',
        }),
      ],
    });

    expect(store.createdInvoice?.status).toBe('pending');
  });

  it('records a payment, creates one receipt, and marks invoice paid when balance is fully collected', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );
    await service.issueInvoice(draft.invoice.id, {}, createSession());

    const result = await service.recordPayment(
      draft.invoice.id,
      {
        amount: '1120.00',
        payment_date: createdAt,
        payment_method: 'gcash',
        reference_number: 'GCASH-123',
        notes: 'Full customer payment',
      },
      createSession(['payments.create']),
    );

    expect(result.payment).toMatchObject({
      invoice_id: draft.invoice.id,
      amount: '1120.00',
      refundable_amount: '1120.00',
      payment_method: 'gcash',
      reference_number: 'GCASH-123',
    });
    expect(result.receipt).toMatchObject({
      invoice_id: draft.invoice.id,
      payment_id: result.payment.id,
      receipt_number: 'RCPT-000001',
      amount: '1120.00',
      payment_method: 'gcash',
    });
    expect(result.invoice).toMatchObject({
      status: 'paid',
      amount_paid: '1120.00',
      remaining_collectible_balance: '0.00',
    });
    expect(store.statusEvents.at(-1)).toMatchObject({
      fromStatus: 'pending',
      toStatus: 'paid',
      reason: 'invoice_payment_recorded',
    });
  });

  it('blocks payment amounts greater than remaining collectible balance', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );
    await service.issueInvoice(draft.invoice.id, {}, createSession());

    await expect(
      service.recordPayment(
        draft.invoice.id,
        {
          amount: '1120.01',
          payment_date: createdAt,
          payment_method: 'cash',
        },
        createSession(['payments.create']),
      ),
    ).rejects.toMatchObject({
      code: 'invoice_overpayment_blocked',
    });

    expect(store.createdPayments).toEqual([]);
    expect(store.createdReceipts).toEqual([]);
  });

  it('blocks payments for draft invoices', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );

    await expect(
      service.recordPayment(
        draft.invoice.id,
        {
          amount: '100.00',
          payment_date: createdAt,
          payment_method: 'cash',
        },
        createSession(['payments.create']),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [
        expect.objectContaining({
          code: 'invoice_status_not_collectible',
        }),
      ],
    });

    expect(store.createdPayments).toEqual([]);
  });

  it('requires payments.create permission to record invoice payments', async () => {
    const store = new FakeInvoiceStore();
    const service = createService(store);
    const draft = await service.createDraftInvoice(
      {
        job_order_ids: [jobOrderId],
        invoice_date: createdAt,
      },
      createSession(),
    );
    await service.issueInvoice(draft.invoice.id, {}, createSession());

    await expect(
      service.recordPayment(
        draft.invoice.id,
        {
          amount: '100.00',
          payment_date: createdAt,
          payment_method: 'cash',
        },
        createSession([]),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'payments.create' }],
    });
  });
});

function createService(store: FakeInvoiceStore): InvoicesService {
  return new InvoicesService(
    store,
    {
      async runInTransaction<Result>(work: (transaction: DatabaseQueryClient) => Promise<Result>) {
        return work({} as DatabaseQueryClient);
      },
    } satisfies DatabaseTransactionRunner,
    {
      async record() {
        return {} as Awaited<ReturnType<AuditService['record']>>;
      },
    } as unknown as AuditService,
  );
}

function createSession(
  permissions: readonly string[] = [
    'invoices.create',
    'invoices.read',
    'invoices.issue',
    'invoices.cancel',
    'invoices.void',
  ],
): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: userId,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: 'active',
    },
    effective_permissions: [...permissions],
    branches: [{ id: branchId }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

function createDefaultJobOrderLine(): InvoiceDraftJobOrderLineRecord {
  return {
    id: jobOrderLineId,
    tenantId,
    jobOrderId,
    lineType: 'service',
    serviceId: '77777777-7777-4777-8777-777777777777',
    productId: null,
    description: 'Tune up service',
    quantity: '1.000',
    unitPrice: '1000.00',
    authorizedAmount: '1000.00',
    status: 'completed',
    lineOrder: 0,
  };
}

class FakeInvoiceStore extends InvoiceStore {
  allocationTotals: readonly BillingAllocationTotalRecord[] = [];
  createdInvoice: InvoiceRecord | null = null;
  createdLines: readonly InvoiceLineRecord[] = [];
  createdJobOrderLinks: readonly InvoiceJobOrderRecord[] = [];
  createdAllocations: readonly InvoiceBillingAllocationRecord[] = [];
  createdPayments: readonly InvoicePaymentRecord[] = [];
  createdReceipts: readonly InvoiceReceiptRecord[] = [];
  createBillingAllocationsResult: readonly InvoiceBillingAllocationRecord[] | null = null;
  invoiceSettings: InvoiceSettingsRecord = {
    invoicePrefix: 'INV-',
    taxProfile: 'vat_registered',
    taxMode: 'tax_exclusive',
    vatRate: '0.1200',
    defaultInvoiceDueDays: 7,
    timezone: 'Asia/Manila',
  };
  jobOrderLines: readonly InvoiceDraftJobOrderLineRecord[] = [createDefaultJobOrderLine()];
  statusEvents: readonly InvoiceStatusEventRecord[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return false;
  }

  async lockInvoiceSettingsForUpdate(): Promise<InvoiceSettingsRecord> {
    return this.invoiceSettings;
  }

  async findDraftJobOrdersForUpdate(): Promise<readonly InvoiceDraftJobOrderRecord[]> {
    return [
      {
        id: jobOrderId,
        tenantId,
        branchId,
        customerId,
        status: 'completed',
      },
    ];
  }

  async findDraftJobOrderLinesForUpdate(): Promise<readonly InvoiceDraftJobOrderLineRecord[]> {
    return this.jobOrderLines;
  }

  async listOpenBillingAllocationTotals(): Promise<readonly BillingAllocationTotalRecord[]> {
    return this.allocationTotals;
  }

  async createDraftInvoice(input: CreateDraftInvoiceInput): Promise<InvoiceRecord> {
    this.createdInvoice = {
      id: input.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      status: 'draft',
      taxProfile: input.taxProfile,
      taxMode: input.taxMode,
      vatRate: input.vatRate,
      subtotalAmount: input.subtotalAmount,
      discountAmount: input.discountAmount,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      amountPaid: '0.00',
      amountRefunded: '0.00',
      remainingCollectibleBalance: input.remainingCollectibleBalance,
      discountReason: input.discountReason,
      issuedAt: null,
      cancelledAt: null,
      voidedAt: null,
      refundedAt: null,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lockVersion: 0,
    };

    return this.createdInvoice;
  }

  async createInvoiceJobOrderLinks(
    input: CreateInvoiceJobOrderLinksInput,
  ): Promise<readonly InvoiceJobOrderRecord[]> {
    this.createdJobOrderLinks = input.jobOrders.map((jobOrder) => ({
      id: jobOrder.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      jobOrderId: jobOrder.jobOrderId,
      createdAt: jobOrder.createdAt,
    }));

    return this.createdJobOrderLinks;
  }

  async createInvoiceLines(input: CreateInvoiceLinesInput): Promise<readonly InvoiceLineRecord[]> {
    this.createdLines = input.lines.map((line) => ({
      id: line.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      originatingJobOrderLineId: line.originatingJobOrderLineId,
      lineType: line.lineType,
      productId: line.productId,
      serviceId: line.serviceId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineDiscountAmount: line.lineDiscountAmount,
      allocatedInvoiceDiscountAmount: line.allocatedInvoiceDiscountAmount,
      taxableBaseAmount: line.taxableBaseAmount,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      lineOrder: line.lineOrder,
    }));

    return this.createdLines;
  }

  async createBillingAllocations(
    input: CreateInvoiceBillingAllocationsInput,
  ): Promise<readonly InvoiceBillingAllocationRecord[]> {
    this.createdAllocations = input.allocations.map((allocation) => ({
      id: allocation.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      invoiceLineId: allocation.invoiceLineId,
      jobOrderLineId: allocation.jobOrderLineId,
      allocatedQuantity: allocation.allocatedQuantity,
      allocatedAmount: allocation.allocatedAmount,
      status: allocation.status,
      createdAt: allocation.createdAt,
      updatedAt: allocation.createdAt,
    }));

    return this.createBillingAllocationsResult ?? this.createdAllocations;
  }

  async replaceDraftInvoiceLines(): Promise<readonly InvoiceLineRecord[]> {
    return [];
  }

  async findInvoiceWithDetails(): Promise<InvoiceWithDetailsRecord | null> {
    if (this.createdInvoice === null) {
      return null;
    }

    return {
      invoice: this.createdInvoice,
      jobOrders: this.createdJobOrderLinks,
      lines: this.createdLines,
      billingAllocations: this.createdAllocations,
    };
  }

  async lockInvoiceWithDetailsForUpdate(): Promise<InvoiceWithDetailsRecord | null> {
    return this.findInvoiceWithDetails();
  }

  async updateInvoiceWorkflowStatus(
    input: UpdateInvoiceWorkflowStatusInput,
  ): Promise<InvoiceRecord | null> {
    if (this.createdInvoice === null || this.createdInvoice.status !== input.fromStatus) {
      return null;
    }

    this.createdInvoice = {
      ...this.createdInvoice,
      status: input.toStatus,
      issuedAt: input.issuedAt ?? this.createdInvoice.issuedAt,
      cancelledAt: input.cancelledAt ?? this.createdInvoice.cancelledAt,
      voidedAt: input.voidedAt ?? this.createdInvoice.voidedAt,
      updatedAt: input.changedAt,
      lockVersion: this.createdInvoice.lockVersion + 1,
    };

    return this.createdInvoice;
  }

  async updateBillingAllocationStatuses(
    input: UpdateBillingAllocationStatusesInput,
  ): Promise<readonly InvoiceBillingAllocationRecord[]> {
    const fromStatuses = new Set<InvoiceBillingAllocationRecord['status']>(input.fromStatuses);
    const changed: InvoiceBillingAllocationRecord[] = [];

    this.createdAllocations = this.createdAllocations.map((allocation) => {
      if (!fromStatuses.has(allocation.status)) {
        return allocation;
      }

      const updated = {
        ...allocation,
        status: input.toStatus,
        updatedAt: input.changedAt,
      };

      changed.push(updated);

      return updated;
    });

    return changed;
  }

  async createPayment(input: CreateInvoicePaymentInput): Promise<InvoicePaymentRecord> {
    const payment = {
      id: input.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      refundableAmount: input.amount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    };

    this.createdPayments = [...this.createdPayments, payment];

    return payment;
  }

  async createReceipt(input: CreateInvoiceReceiptInput): Promise<InvoiceReceiptRecord> {
    const receipt = {
      id: input.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      receiptNumber: input.receiptNumber,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      issuedAt: input.issuedAt,
      createdByUserId: input.createdByUserId,
    };

    this.createdReceipts = [...this.createdReceipts, receipt];

    return receipt;
  }

  async updateInvoicePaymentTotals(
    input: UpdateInvoicePaymentTotalsInput,
  ): Promise<InvoiceRecord | null> {
    if (this.createdInvoice === null) {
      return null;
    }

    this.createdInvoice = {
      ...this.createdInvoice,
      amountPaid: input.amountPaid,
      remainingCollectibleBalance: input.remainingCollectibleBalance,
      status: input.status,
      updatedAt: input.changedAt,
      lockVersion: this.createdInvoice.lockVersion + 1,
    };

    return this.createdInvoice;
  }

  async allocateReceiptNumber(): Promise<string> {
    return `RCPT-${String(this.createdReceipts.length + 1).padStart(6, '0')}`;
  }

  async insertStatusEvent(input: InsertInvoiceStatusEventInput): Promise<InvoiceStatusEventRecord> {
    const event = {
      id: input.id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    };

    this.statusEvents = [...this.statusEvents, event];

    return event;
  }

  async listStatusEvents(): Promise<readonly InvoiceStatusEventRecord[]> {
    return this.statusEvents;
  }

  async listInvoices(_input: ListInvoicesInput): Promise<readonly InvoiceRecord[]> {
    return this.createdInvoice === null ? [] : [this.createdInvoice];
  }

  async findLatestInvoiceNumberForDate(_input: FindLatestInvoiceNumberForDateInput): Promise<null> {
    return null;
  }

  setPaymentSnapshot(input: { amountPaid: string; amountRefunded: string }): void {
    if (this.createdInvoice === null) {
      throw new Error('Cannot set payment snapshot without a created invoice.');
    }

    this.createdInvoice = {
      ...this.createdInvoice,
      amountPaid: input.amountPaid,
      amountRefunded: input.amountRefunded,
    };
  }
}
