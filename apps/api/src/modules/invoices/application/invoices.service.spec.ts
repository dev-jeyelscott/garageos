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
  type FindLatestInvoiceNumberForDateInput,
  type InsertInvoiceStatusEventInput,
  type InvoiceDraftJobOrderLineRecord,
  type InvoiceDraftJobOrderRecord,
  type InvoiceSettingsRecord,
  type ListInvoicesInput,
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

function createSession(): TenantContextAuthenticatedSession {
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
    effective_permissions: ['invoices.create', 'invoices.read'],
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

    this.statusEvents = [event];

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
}
