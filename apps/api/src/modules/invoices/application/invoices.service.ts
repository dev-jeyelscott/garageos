import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  buildNextInvoiceNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CancelInvoiceRequest,
  CreateInvoicePaymentRequest,
  CreateInvoiceRefundRequest,
  CreateDraftInvoiceRequest,
  IssueInvoiceRequest,
  ListInvoicesQuery,
  ListReceiptsQuery,
  VoidInvoiceRequest,
} from '../api/invoice.schemas';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import { INVENTORY_TRANSACTION_TYPES } from '../../inventory/application/inventory-ledger.store';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import {
  calculateInvoice,
  InvoiceCalculationError,
  type CalculateInvoiceInput,
  type InvoiceLevelDiscountInput,
} from '../domain/invoice-calculation.service';
import {
  BILLING_ALLOCATION_STATUSES,
  INVOICE_STATUSES,
  type BillingAllocationStatus,
  type InvoiceInventoryReversalRecord,
  type InvoiceLineType,
  type InvoicePaymentRecord,
  type InvoiceReceiptRecord,
  type InvoiceRefundRecord,
  type InvoiceRecord,
  type InvoiceStatus,
  type InvoiceStatusEventRecord,
  type InvoiceWithDetailsRecord,
} from './invoice.records';
import {
  InvoiceStore,
  type BillingAllocationTotalRecord,
  type CreateInvoiceLineInput,
  type InvoiceDraftJobOrderLineRecord,
  type InvoiceDraftJobOrderRecord,
  type InvoiceInventoryConsumptionCostRecord,
  type InvoiceSettingsRecord,
} from './invoice.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const ZERO_QUANTITY = '0.000';
const REVERSAL_SOURCE_TYPE = 'invoice_inventory_reversal';

export interface InvoiceLineResponse {
  readonly id: string;
  readonly originating_job_order_line_id: string | null;
  readonly line_type: InvoiceLineType;
  readonly product_id: string | null;
  readonly service_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly line_discount_amount: string;
  readonly allocated_invoice_discount_amount: string;
  readonly taxable_base_amount: string;
  readonly tax_amount: string;
  readonly line_total: string;
  readonly line_order: number;
}

export interface InvoiceResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly invoice_number: string;
  readonly invoice_date: string;
  readonly due_date: string | null;
  readonly status: InvoiceRecord['status'];
  readonly tax_profile: InvoiceRecord['taxProfile'];
  readonly tax_mode: InvoiceRecord['taxMode'];
  readonly vat_rate: string | null;
  readonly subtotal_amount: string;
  readonly discount_amount: string;
  readonly tax_amount: string;
  readonly total_amount: string;
  readonly amount_paid: string;
  readonly amount_refunded: string;
  readonly remaining_collectible_balance: string;
  readonly discount_reason: string | null;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InvoiceDetailResponse {
  readonly invoice: InvoiceResponse;
  readonly job_order_ids: readonly string[];
  readonly lines: readonly InvoiceLineResponse[];
}

export interface InvoiceListResponse {
  readonly invoices: readonly InvoiceResponse[];
}

export interface InvoiceMutationResponse extends InvoiceDetailResponse {}

export interface InvoiceStatusEventResponse {
  readonly id: string;
  readonly invoice_id: string;
  readonly from_status: InvoiceRecord['status'] | null;
  readonly to_status: InvoiceRecord['status'];
  readonly reason: string | null;
  readonly created_by_user_id: string;
  readonly created_at: string;
}

export interface InvoiceStatusEventsResponse {
  readonly status_events: readonly InvoiceStatusEventResponse[];
}

export interface InvoicePaymentResponse {
  readonly id: string;
  readonly invoice_id: string;
  readonly amount: string;
  readonly refundable_amount: string;
  readonly payment_date: string;
  readonly payment_method: InvoicePaymentRecord['paymentMethod'];
  readonly reference_number: string | null;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface InvoiceReceiptResponse {
  readonly id: string;
  readonly invoice_id: string;
  readonly payment_id: string;
  readonly receipt_number: string;
  readonly amount: string;
  readonly payment_method: InvoiceReceiptRecord['paymentMethod'];
  readonly issued_at: string;
}

export interface InvoiceRefundResponse {
  readonly id: string;
  readonly invoice_id: string;
  readonly payment_id: string;
  readonly amount: string;
  readonly reason: string;
  readonly collection_should_continue: boolean;
  readonly close_invoice_after_refund: boolean;
  readonly inventory_reversal_selected: boolean;
  readonly status: InvoiceRefundRecord['status'];
  readonly created_at: string;
}

export interface InvoiceInventoryReversalResponse {
  readonly id: string;
  readonly job_order_line_id: string;
  readonly product_id: string;
  readonly quantity_returned: string;
  readonly inventory_ledger_entry_id: string;
  readonly fifo_layer_id: string;
  readonly created_at: string;
}

export interface InvoicePaymentMutationResponse {
  readonly payment: InvoicePaymentResponse;
  readonly receipt: InvoiceReceiptResponse;
  readonly invoice: InvoiceResponse;
}

export interface InvoiceRefundMutationResponse {
  readonly refund: InvoiceRefundResponse;
  readonly payment: InvoicePaymentResponse;
  readonly invoice: InvoiceResponse;
  readonly inventory_reversals: readonly InvoiceInventoryReversalResponse[];
}

export interface InvoiceReceiptListResponse {
  readonly receipts: readonly InvoiceReceiptResponse[];
}

export interface InvoiceReceiptDetailResponse {
  readonly receipt: InvoiceReceiptResponse;
}

export interface InvoiceReceiptPrintResponse {
  readonly receipt: InvoiceReceiptResponse;
}

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(InvoiceStore)
    private readonly invoiceStore: InvoiceStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(InventoryStockBalancesService)
    private readonly stockBalancesService: InventoryStockBalancesService,
    @Inject(FifoLayerService)
    private readonly fifoLayerService: FifoLayerService,
    @Inject(InventoryLedgerService)
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listInvoices(
    query: ListInvoicesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.read');

    if (query.branch_id !== undefined) {
      assertBranchAccessAllowed({ context, branchId: query.branch_id });
    }

    const invoices = await this.invoiceStore.listInvoices({
      tenantId: context.tenantId,
      branchIds: context.tenantWideBranchAccess ? null : context.assignedBranchIds,
      branchId: query.branch_id ?? null,
      status: query.status ?? null,
      customerId: query.customer_id ?? null,
      fromDate: query.from_date ?? null,
      toDate: query.to_date ?? null,
      limit: query.limit,
    });

    return {
      invoices: invoices.map(toInvoiceResponse),
    };
  }

  async getInvoice(
    invoiceId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.read');

    const invoice = await this.invoiceStore.findInvoiceWithDetails({
      tenantId: context.tenantId,
      invoiceId: invoiceId.trim(),
    });

    if (invoice === null) {
      throw GarageOsApiException.resourceNotFound('Invoice was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: invoice.invoice.branchId });

    return toInvoiceDetailResponse(invoice);
  }

  async listStatusEvents(
    invoiceId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceStatusEventsResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.read');

    const invoice = await this.invoiceStore.findInvoiceWithDetails({
      tenantId: context.tenantId,
      invoiceId: invoiceId.trim(),
    });

    if (invoice === null) {
      throw GarageOsApiException.resourceNotFound('Invoice was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: invoice.invoice.branchId });

    const statusEvents = await this.invoiceStore.listStatusEvents({
      tenantId: context.tenantId,
      invoiceId: invoice.invoice.id,
    });

    return {
      status_events: statusEvents.map(toInvoiceStatusEventResponse),
    };
  }

  async listReceipts(
    query: ListReceiptsQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceReceiptListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInvoicePermission(context, isShopOwner, 'receipts.read');

    const receipts = await this.invoiceStore.listReceipts({
      tenantId: context.tenantId,
      branchIds: context.tenantWideBranchAccess ? null : context.assignedBranchIds,
      limit: query.limit,
    });

    return {
      receipts: receipts.map(toInvoiceReceiptResponse),
    };
  }

  async getReceipt(
    receiptId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceReceiptDetailResponse> {
    const receipt = await this.getAuthorizedReceipt(receiptId, session);

    return {
      receipt: toInvoiceReceiptResponse(receipt),
    };
  }

  async getReceiptPrintMetadata(
    receiptId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceReceiptPrintResponse> {
    const receipt = await this.getAuthorizedReceipt(receiptId, session);

    return {
      receipt: toInvoiceReceiptResponse(receipt),
    };
  }

  async createDraftInvoice(
    request: CreateDraftInvoiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.create');

    const jobOrderIds = uniqueIds(request.job_order_ids);
    const requestedLineIds =
      request.job_order_line_ids === undefined ? null : uniqueIds(request.job_order_line_ids);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const invoiceSettings = await this.invoiceStore.lockInvoiceSettingsForUpdate(
        context.tenantId,
        transaction,
      );

      if (invoiceSettings === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'shop_profile',
            code: 'invoice_settings_missing',
            message: 'Shop profile invoice settings must be completed before creating invoices.',
          },
        ]);
      }

      const jobOrders = await this.invoiceStore.findDraftJobOrdersForUpdate(
        context.tenantId,
        jobOrderIds,
        transaction,
      );

      assertAllRequestedJobOrdersFound(jobOrderIds, jobOrders);
      assertDraftJobOrdersEligible(jobOrders);

      const branchId = assertSingleValue(
        jobOrders.map((jobOrder) => jobOrder.branchId),
        {
          field: 'job_order_ids',
          code: 'invoice_job_orders_must_share_branch',
          message: 'Job orders on one draft invoice must belong to the same branch.',
        },
      );
      const customerId = assertSingleValue(
        jobOrders.map((jobOrder) => jobOrder.customerId),
        {
          field: 'job_order_ids',
          code: 'invoice_job_orders_must_share_customer',
          message: 'Job orders on one draft invoice must belong to the same customer.',
        },
      );

      assertBranchAccessAllowed({ context, branchId });

      const lines = await this.invoiceStore.findDraftJobOrderLinesForUpdate(
        context.tenantId,
        requestedLineIds,
        jobOrderIds,
        transaction,
      );

      assertDraftLinesSelected(requestedLineIds, lines);
      assertDraftLinesEligible(lines);

      const allocationTotals = await this.invoiceStore.listOpenBillingAllocationTotals(
        context.tenantId,
        lines.map((line) => line.id),
        transaction,
      );
      const allocationTotalsByLineId = new Map(
        allocationTotals.map((total) => [total.jobOrderLineId, total] as const),
      );

      assertNoOverbilling(lines, allocationTotals);

      const createdAt = new Date();
      const invoiceDate = request.invoice_date ?? createdAt;
      const dueDate =
        request.due_date === undefined
          ? addDays(invoiceDate, invoiceSettings.defaultInvoiceDueDays)
          : request.due_date;
      const datePart = formatTenantBusinessDate(invoiceDate, invoiceSettings.timezone);
      const invoiceDatePrefix = `${invoiceSettings.invoicePrefix}${datePart}`;
      const latestInvoiceNumber = await this.invoiceStore.findLatestInvoiceNumberForDate(
        {
          tenantId: context.tenantId,
          datePrefix: invoiceDatePrefix,
        },
        transaction,
      );
      const invoiceNumber = buildNextInvoiceNumber(
        invoiceSettings.invoicePrefix,
        datePart,
        latestInvoiceNumber,
      );
      const invoiceId = randomUUID();
      const calculation = calculateDraftInvoice({
        lines,
        allocationTotalsByLineId,
        invoiceSettings,
        invoiceLevelDiscount: request.invoice_level_discount ?? null,
      });
      const invoiceLines: CreateInvoiceLineInput[] = calculation.lines.map((line) => ({
        id: randomUUID(),
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

      const invoice = await this.invoiceStore.createDraftInvoice(
        {
          id: invoiceId,
          tenantId: context.tenantId,
          branchId,
          customerId,
          invoiceNumber,
          invoiceDate,
          dueDate,
          taxProfile: invoiceSettings.taxProfile,
          taxMode: invoiceSettings.taxMode,
          vatRate: invoiceSettings.vatRate,
          subtotalAmount: calculation.totals.subtotalAmount,
          discountAmount: calculation.totals.discountAmount,
          taxAmount: calculation.totals.taxAmount,
          totalAmount: calculation.totals.totalAmount,
          remainingCollectibleBalance: calculation.totals.remainingCollectibleBalance,
          discountReason: calculation.totals.discountReason,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      const jobOrderLinks = await this.invoiceStore.createInvoiceJobOrderLinks(
        {
          tenantId: context.tenantId,
          invoiceId,
          jobOrders: jobOrders.map((jobOrder) => ({
            id: randomUUID(),
            jobOrderId: jobOrder.id,
            createdAt,
          })),
        },
        transaction,
      );
      const createdLines = await this.invoiceStore.createInvoiceLines(
        {
          tenantId: context.tenantId,
          invoiceId,
          lines: invoiceLines,
        },
        transaction,
      );

      const createdAllocations = await this.invoiceStore.createBillingAllocations(
        {
          tenantId: context.tenantId,
          invoiceId,
          allocations: createdLines.map((line) => ({
            id: randomUUID(),
            invoiceLineId: line.id,
            jobOrderLineId: line.originatingJobOrderLineId ?? '',
            allocatedQuantity: line.quantity,
            allocatedAmount: null,
            status: BILLING_ALLOCATION_STATUSES.RESERVED,
            createdAt,
          })),
        },
        transaction,
      );
      assertBillingAllocationsCreated(createdLines.length, createdAllocations.length);

      await this.invoiceStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          invoiceId,
          fromStatus: null,
          toStatus: INVOICE_STATUSES.DRAFT,
          reason: 'invoice_draft_created',
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      const created = await this.invoiceStore.findInvoiceWithDetails(
        {
          tenantId: context.tenantId,
          invoiceId,
        },
        transaction,
      );

      if (created === null) {
        throw new Error('Invoice draft was not readable after creation.');
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'invoices.draft_created',
        entityType: 'invoice',
        entityId: invoice.id,
        branchId: invoice.branchId,
        afterJson: toInvoiceDetailResponse(created),
        reason: 'invoice_draft_created',
        client: transaction,
      });

      return {
        ...toInvoiceDetailResponse({
          invoice,
          jobOrders: jobOrderLinks,
          lines: createdLines,
          billingAllocations: created.billingAllocations,
        }),
      };
    });
  }

  async issueInvoice(
    invoiceId: string,
    _request: IssueInvoiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.issue');

    return this.transitionInvoiceWorkflow({
      context,
      invoiceId,
      allowedStatuses: [INVOICE_STATUSES.DRAFT],
      toStatus: INVOICE_STATUSES.PENDING,
      reason: 'invoice_issued',
      auditAction: 'invoices.issued',
      allocationTransition: {
        fromStatuses: [BILLING_ALLOCATION_STATUSES.RESERVED],
        toStatus: BILLING_ALLOCATION_STATUSES.FINAL,
      },
      timestampField: 'issuedAt',
      validate: (invoice) => {
        if (invoice.lines.length === 0) {
          throw GarageOsApiException.workflowTransitionBlocked(
            'Invoice cannot be issued without invoice lines.',
            [
              {
                field: 'invoice_id',
                code: 'invoice_requires_lines_before_issue',
                message: 'Invoice cannot be issued without invoice lines.',
              },
            ],
          );
        }
      },
    });
  }

  async cancelInvoice(
    invoiceId: string,
    request: CancelInvoiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.cancel');

    return this.transitionInvoiceWorkflow({
      context,
      invoiceId,
      allowedStatuses: [INVOICE_STATUSES.DRAFT, INVOICE_STATUSES.PENDING],
      toStatus: INVOICE_STATUSES.CANCELLED,
      reason: request.reason,
      auditAction: 'invoices.cancelled',
      allocationTransition: {
        fromStatuses: [BILLING_ALLOCATION_STATUSES.RESERVED, BILLING_ALLOCATION_STATUSES.FINAL],
        toStatus: BILLING_ALLOCATION_STATUSES.RELEASED,
      },
      timestampField: 'cancelledAt',
      validate: (invoice) => {
        assertInvoiceHasNoPaymentsOrRefunds(invoice.invoice, 'cancel');
      },
    });
  }

  async voidInvoice(
    invoiceId: string,
    request: VoidInvoiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertInvoicePermission(context, isShopOwner, 'invoices.void');

    return this.transitionInvoiceWorkflow({
      context,
      invoiceId,
      allowedStatuses: [
        INVOICE_STATUSES.PENDING,
        INVOICE_STATUSES.OVERDUE,
        INVOICE_STATUSES.PARTIALLY_PAID,
        INVOICE_STATUSES.PAID,
      ],
      toStatus: INVOICE_STATUSES.VOIDED,
      reason: request.reason,
      auditAction: 'invoices.voided',
      allocationTransition: {
        fromStatuses: [BILLING_ALLOCATION_STATUSES.RESERVED, BILLING_ALLOCATION_STATUSES.FINAL],
        toStatus: BILLING_ALLOCATION_STATUSES.RELEASED,
      },
      timestampField: 'voidedAt',
      validate: (invoice) => {
        assertInvoicePaymentsRefundedBeforeVoid(invoice.invoice);
      },
      afterTransition: async ({ current, updatedInvoice, changedAt, transaction }) =>
        this.createInventoryReversals({
          context,
          isShopOwner,
          sourceType: 'void',
          sourceId: updatedInvoice.id,
          invoice: current,
          reversal: request.inventory_reversal ?? null,
          transactionType: INVENTORY_TRANSACTION_TYPES.VOID_INVENTORY_REVERSAL,
          createdAt: changedAt,
          transaction,
        }),
    });
  }

  async recordPayment(
    invoiceId: string,
    request: CreateInvoicePaymentRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoicePaymentMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertInvoicePermission(context, isShopOwner, 'payments.create');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const current = await this.invoiceStore.lockInvoiceWithDetailsForUpdate(
        {
          tenantId: context.tenantId,
          invoiceId: invoiceId.trim(),
        },
        transaction,
      );

      if (current === null) {
        throw GarageOsApiException.resourceNotFound('Invoice was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: current.invoice.branchId });
      assertInvoiceCanReceivePayment(current.invoice);
      assertPaymentDoesNotOverpay(request.amount, current.invoice.remainingCollectibleBalance);

      const createdAt = new Date();
      const receiptNumber = await this.invoiceStore.allocateReceiptNumber(
        {
          tenantId: context.tenantId,
        },
        transaction,
      );

      if (receiptNumber === null) {
        throw new Error('Invoice store failed to allocate receipt number.');
      }

      const payment = await this.invoiceStore.createPayment(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
          amount: request.amount,
          paymentDate: request.payment_date,
          paymentMethod: request.payment_method,
          referenceNumber: request.reference_number ?? null,
          notes: request.notes ?? null,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );
      const receipt = await this.invoiceStore.createReceipt(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
          paymentId: payment.id,
          receiptNumber,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          issuedAt: createdAt,
          createdByUserId: context.actorUserId,
        },
        transaction,
      );
      const nextAmountPaid = addMoney(current.invoice.amountPaid, payment.amount);
      const nextRemainingBalance = subtractMoney(
        current.invoice.remainingCollectibleBalance,
        payment.amount,
      );
      const nextStatus = calculateInvoicePaymentStatus(current.invoice, nextRemainingBalance);
      const updatedInvoice = await this.invoiceStore.updateInvoicePaymentTotals(
        {
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
          amountPaid: nextAmountPaid,
          remainingCollectibleBalance: nextRemainingBalance,
          status: nextStatus,
          changedAt: createdAt,
        },
        transaction,
      );

      if (updatedInvoice === null) {
        throw GarageOsApiException.versionConflict();
      }

      if (updatedInvoice.status !== current.invoice.status) {
        await this.invoiceStore.insertStatusEvent(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            invoiceId: updatedInvoice.id,
            fromStatus: current.invoice.status,
            toStatus: updatedInvoice.status,
            reason: 'invoice_payment_recorded',
            createdByUserId: context.actorUserId,
            createdAt,
          },
          transaction,
        );
      }

      const response = {
        payment: toInvoicePaymentResponse(payment),
        receipt: toInvoiceReceiptResponse(receipt),
        invoice: toInvoiceResponse(updatedInvoice),
      };

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'payments.created',
        entityType: 'payment',
        entityId: payment.id,
        branchId: updatedInvoice.branchId,
        beforeJson: toInvoiceDetailResponse(current),
        afterJson: response,
        reason: 'invoice_payment_recorded',
        client: transaction,
      });

      return response;
    });
  }

  async recordRefund(
    paymentId: string,
    request: CreateInvoiceRefundRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceRefundMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertAnyInvoicePermission(context, isShopOwner, ['payments.refund', 'invoices.refund']);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const current = await this.invoiceStore.lockPaymentWithInvoiceForUpdate(
        {
          tenantId: context.tenantId,
          paymentId: paymentId.trim(),
        },
        transaction,
      );

      if (current === null) {
        throw GarageOsApiException.resourceNotFound('Payment was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: current.invoice.branchId });
      assertInvoiceCanReceiveRefund(current.invoice);
      assertRefundDoesNotExceedRefundable(request.amount, current.payment.refundableAmount);

      const createdAt = new Date();
      const currentInvoiceDetails = await this.invoiceStore.findInvoiceWithDetails(
        {
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
        },
        transaction,
      );

      if (currentInvoiceDetails === null) {
        throw GarageOsApiException.resourceNotFound('Invoice was not found.');
      }

      const nextPaymentRefundableAmount = subtractMoney(
        current.payment.refundableAmount,
        request.amount,
      );
      const nextAmountRefunded = addMoney(current.invoice.amountRefunded, request.amount);
      const fullyRefunded =
        parseMoneyCents(nextAmountRefunded) >= parseMoneyCents(current.invoice.amountPaid);

      if (request.close_invoice_after_refund && !fullyRefunded) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'close_invoice_after_refund',
            code: 'invoice_close_after_refund_requires_full_refund',
            message:
              'Invoice can be closed as refunded only after all payment amounts are refunded.',
          },
        ]);
      }

      const refund = await this.invoiceStore.createRefund(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
          paymentId: current.payment.id,
          amount: request.amount,
          reason: request.reason,
          collectionShouldContinue: request.collection_should_continue,
          closeInvoiceAfterRefund: request.close_invoice_after_refund,
          inventoryReversalSelected: request.inventory_reversal?.selected ?? false,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );
      const inventoryReversals = await this.createInventoryReversals({
        context,
        isShopOwner,
        sourceType: 'refund',
        sourceId: refund.id,
        invoice: currentInvoiceDetails,
        reversal: request.inventory_reversal ?? null,
        transactionType: INVENTORY_TRANSACTION_TYPES.REFUND_INVENTORY_REVERSAL,
        createdAt,
        transaction,
      });
      const payment = await this.invoiceStore.updatePaymentRefundableAmount(
        {
          tenantId: context.tenantId,
          paymentId: current.payment.id,
          refundableAmount: nextPaymentRefundableAmount,
        },
        transaction,
      );

      if (payment === null) {
        throw GarageOsApiException.versionConflict();
      }

      const nextInvoiceState = calculateInvoiceRefundState({
        invoice: current.invoice,
        refundAmount: request.amount,
        nextAmountRefunded,
        closeInvoiceAfterRefund: request.close_invoice_after_refund,
        changedAt: createdAt,
      });
      const updatedInvoice = await this.invoiceStore.updateInvoiceRefundTotals(
        {
          tenantId: context.tenantId,
          invoiceId: current.invoice.id,
          amountRefunded: nextAmountRefunded,
          remainingCollectibleBalance: nextInvoiceState.remainingCollectibleBalance,
          status: nextInvoiceState.status,
          refundedAt: nextInvoiceState.refundedAt,
          changedAt: createdAt,
        },
        transaction,
      );

      if (updatedInvoice === null) {
        throw GarageOsApiException.versionConflict();
      }

      if (updatedInvoice.status !== current.invoice.status) {
        await this.invoiceStore.insertStatusEvent(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            invoiceId: updatedInvoice.id,
            fromStatus: current.invoice.status,
            toStatus: updatedInvoice.status,
            reason: 'invoice_refund_recorded',
            createdByUserId: context.actorUserId,
            createdAt,
          },
          transaction,
        );
      }

      const response = {
        refund: toInvoiceRefundResponse(refund),
        payment: toInvoicePaymentResponse(payment),
        invoice: toInvoiceResponse(updatedInvoice),
        inventory_reversals: inventoryReversals.map(toInvoiceInventoryReversalResponse),
      };

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'payments.refunded',
        entityType: 'refund',
        entityId: refund.id,
        branchId: updatedInvoice.branchId,
        beforeJson: {
          payment: toInvoicePaymentResponse(current.payment),
          invoice: toInvoiceResponse(current.invoice),
        },
        afterJson: response,
        reason: request.reason,
        client: transaction,
      });

      return response;
    });
  }

  private async getAuthorizedReceipt(
    receiptId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InvoiceReceiptRecord> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.invoiceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInvoicePermission(context, isShopOwner, 'receipts.read');

    const receipt = await this.invoiceStore.findReceiptWithBranch({
      tenantId: context.tenantId,
      receiptId: receiptId.trim(),
    });

    if (receipt === null) {
      throw GarageOsApiException.resourceNotFound('Receipt was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: receipt.branchId });

    return receipt.receipt;
  }

  private async transitionInvoiceWorkflow(input: {
    readonly context: ResolvedTenantContext;
    readonly invoiceId: string;
    readonly allowedStatuses: readonly InvoiceStatus[];
    readonly toStatus: InvoiceStatus;
    readonly reason: string;
    readonly auditAction: string;
    readonly allocationTransition: {
      readonly fromStatuses: readonly BillingAllocationStatus[];
      readonly toStatus: BillingAllocationStatus;
    };
    readonly timestampField: 'issuedAt' | 'cancelledAt' | 'voidedAt';
    readonly validate?: (invoice: InvoiceWithDetailsRecord) => void;
    readonly afterTransition?: (input: {
      readonly current: InvoiceWithDetailsRecord;
      readonly updatedInvoice: InvoiceRecord;
      readonly changedAt: Date;
      readonly transaction: DatabaseQueryClient;
    }) => Promise<readonly InvoiceInventoryReversalRecord[]>;
  }): Promise<InvoiceMutationResponse> {
    return this.transactionRunner.runInTransaction(async (transaction) => {
      const current = await this.invoiceStore.lockInvoiceWithDetailsForUpdate(
        {
          tenantId: input.context.tenantId,
          invoiceId: input.invoiceId.trim(),
        },
        transaction,
      );

      if (current === null) {
        throw GarageOsApiException.resourceNotFound('Invoice was not found.');
      }

      assertBranchAccessAllowed({
        context: input.context,
        branchId: current.invoice.branchId,
      });
      assertInvoiceCurrentStatusAllowed(current.invoice, input.allowedStatuses, input.toStatus);

      input.validate?.(current);

      const changedAt = new Date();
      const updatedInvoice = await this.invoiceStore.updateInvoiceWorkflowStatus(
        {
          tenantId: input.context.tenantId,
          invoiceId: current.invoice.id,
          fromStatus: current.invoice.status,
          toStatus: input.toStatus,
          changedAt,
          ...(input.timestampField === 'issuedAt' ? { issuedAt: changedAt } : {}),
          ...(input.timestampField === 'cancelledAt' ? { cancelledAt: changedAt } : {}),
          ...(input.timestampField === 'voidedAt' ? { voidedAt: changedAt } : {}),
        },
        transaction,
      );

      if (updatedInvoice === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Invoice status changed before this workflow action could complete.',
          [
            {
              field: 'invoice_id',
              code: 'invoice_status_conflict',
              message: 'Reload the invoice and retry this workflow action.',
            },
          ],
        );
      }

      await this.invoiceStore.updateBillingAllocationStatuses(
        {
          tenantId: input.context.tenantId,
          invoiceId: updatedInvoice.id,
          fromStatuses: input.allocationTransition.fromStatuses,
          toStatus: input.allocationTransition.toStatus,
          changedAt,
        },
        transaction,
      );

      const inventoryReversals =
        (await input.afterTransition?.({
          current,
          updatedInvoice,
          changedAt,
          transaction,
        })) ?? [];

      await this.invoiceStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: input.context.tenantId,
          invoiceId: updatedInvoice.id,
          fromStatus: current.invoice.status,
          toStatus: updatedInvoice.status,
          reason: input.reason,
          createdByUserId: input.context.actorUserId,
          createdAt: changedAt,
        },
        transaction,
      );

      const updated = await this.invoiceStore.findInvoiceWithDetails(
        {
          tenantId: input.context.tenantId,
          invoiceId: updatedInvoice.id,
        },
        transaction,
      );

      if (updated === null) {
        throw new Error('Invoice was not readable after workflow transition.');
      }

      await this.auditService.record({
        tenantId: input.context.tenantId,
        actorUserId: input.context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: input.auditAction,
        entityType: 'invoice',
        entityId: updatedInvoice.id,
        branchId: updatedInvoice.branchId,
        beforeJson: toInvoiceDetailResponse(current),
        afterJson: {
          ...toInvoiceDetailResponse(updated),
          inventory_reversals: inventoryReversals.map(toInvoiceInventoryReversalResponse),
        },
        reason: input.reason,
        client: transaction,
      });

      return {
        ...toInvoiceDetailResponse(updated),
        inventory_reversals: inventoryReversals.map(toInvoiceInventoryReversalResponse),
      };
    });
  }

  private async createInventoryReversals(input: {
    readonly context: ResolvedTenantContext;
    readonly isShopOwner: boolean;
    readonly sourceType: 'refund' | 'void';
    readonly sourceId: string;
    readonly invoice: InvoiceWithDetailsRecord;
    readonly reversal:
      | CreateInvoiceRefundRequest['inventory_reversal']
      | VoidInvoiceRequest['inventory_reversal']
      | null;
    readonly transactionType:
      | typeof INVENTORY_TRANSACTION_TYPES.REFUND_INVENTORY_REVERSAL
      | typeof INVENTORY_TRANSACTION_TYPES.VOID_INVENTORY_REVERSAL;
    readonly createdAt: Date;
    readonly transaction: DatabaseQueryClient;
  }): Promise<readonly InvoiceInventoryReversalRecord[]> {
    if (input.reversal?.selected !== true) {
      return [];
    }

    if (input.reversal.lines.length === 0) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'inventory_reversal.lines',
          code: 'inventory_reversal_lines_required',
          message:
            'At least one returned part line is required when inventory reversal is selected.',
        },
      ]);
    }

    assertAnyInvoicePermission(input.context, input.isShopOwner, [
      'inventory.adjust',
      'inventory.force_adjust',
    ]);

    const linesById = new Map(input.invoice.lines.map((line) => [line.id, line] as const));
    const requestedLines = input.reversal.lines.map((line) => {
      const invoiceLine = linesById.get(line.invoice_line_id);

      if (
        invoiceLine === undefined ||
        invoiceLine.originatingJobOrderLineId === null ||
        invoiceLine.productId === null ||
        invoiceLine.productId !== line.product_id
      ) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'inventory_reversal.lines',
            code: 'inventory_reversal_line_not_returnable',
            message:
              'Inventory reversal lines must reference invoiced part lines for this invoice.',
          },
        ]);
      }

      return {
        invoiceLine,
        jobOrderLineId: invoiceLine.originatingJobOrderLineId,
        productId: invoiceLine.productId,
        quantityReturned: line.return_quantity,
      };
    });
    const requestedByJobOrderLineId = new Map<string, bigint>();

    for (const line of requestedLines) {
      requestedByJobOrderLineId.set(
        line.jobOrderLineId,
        (requestedByJobOrderLineId.get(line.jobOrderLineId) ?? 0n) +
          parseQuantityThousandths(line.quantityReturned),
      );
    }

    const jobOrderLineIds = [...requestedByJobOrderLineId.keys()];
    const refundTotals = await this.invoiceStore.listRefundInventoryReversalTotals(
      input.context.tenantId,
      jobOrderLineIds,
      input.transaction,
    );
    const voidTotals = await this.invoiceStore.listVoidInventoryReversalTotals(
      input.context.tenantId,
      jobOrderLineIds,
      input.transaction,
    );
    const returnedByJobOrderLineId = new Map<string, bigint>();

    for (const total of [...refundTotals, ...voidTotals]) {
      returnedByJobOrderLineId.set(
        total.jobOrderLineId,
        (returnedByJobOrderLineId.get(total.jobOrderLineId) ?? 0n) +
          parseQuantityThousandths(total.quantityReturned),
      );
    }

    for (const [jobOrderLineId, requestedQuantity] of requestedByJobOrderLineId) {
      const invoiceLine = requestedLines.find(
        (line) => line.jobOrderLineId === jobOrderLineId,
      )?.invoiceLine;

      if (invoiceLine === undefined) {
        continue;
      }

      const remainingReturnable =
        parseQuantityThousandths(invoiceLine.quantity) -
        (returnedByJobOrderLineId.get(jobOrderLineId) ?? 0n);

      if (requestedQuantity > remainingReturnable) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'inventory_reversal.lines.return_quantity',
            code: 'inventory_reversal_exceeds_returnable_quantity',
            message:
              'Returned quantity cannot exceed the invoiced quantity minus prior refund or void reversals.',
          },
        ]);
      }
    }

    const consumptionCosts = await this.invoiceStore.listJobOrderLineInventoryConsumptionCosts(
      input.context.tenantId,
      jobOrderLineIds,
      input.transaction,
    );
    const costsByJobOrderLineId = groupInventoryConsumptionCosts(consumptionCosts);
    const reversalSegments = buildInventoryReversalSegments({
      requestedLines,
      costsByJobOrderLineId,
      returnedByJobOrderLineId,
    });
    const reversalRows = [];

    for (const segment of reversalSegments) {
      await this.stockBalancesService.incrementOnHandStock(
        {
          tenantId: input.context.tenantId,
          branchId: input.invoice.invoice.branchId,
          productId: segment.productId,
          quantityReceived: segment.quantityReturned,
        },
        input.transaction,
      );
      const fifoLayer = await this.fifoLayerService.createLayer(
        {
          tenantId: input.context.tenantId,
          branchId: input.invoice.invoice.branchId,
          productId: segment.productId,
          quantityReceived: segment.quantityReturned,
          unitCost: segment.unitCost,
          sourceTransactionType: input.transactionType,
          sourceTransactionId: input.sourceId,
          receivedAt: input.createdAt,
          originalSourceLayerId: segment.originalSourceLayerId,
        },
        input.transaction,
      );
      const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
        {
          tenantId: input.context.tenantId,
          branchId: input.invoice.invoice.branchId,
          productId: segment.productId,
          transactionType: input.transactionType,
          quantityDeltaOnHand: segment.quantityReturned,
          quantityDeltaReserved: ZERO_QUANTITY,
          unitCost: segment.unitCost,
          totalCost: multiplyQuantityByMoney(segment.quantityReturned, segment.unitCost),
          sourceType: REVERSAL_SOURCE_TYPE,
          sourceId: input.sourceId,
          occurredAt: input.createdAt,
          createdByUserId: input.context.actorUserId,
        },
        input.transaction,
      );

      reversalRows.push({
        id: randomUUID(),
        jobOrderLineId: segment.jobOrderLineId,
        productId: segment.productId,
        quantityReturned: segment.quantityReturned,
        inventoryLedgerEntryId: ledgerEntry.id,
        fifoLayerId: fifoLayer.id,
        createdAt: input.createdAt,
      });
    }

    return input.sourceType === 'refund'
      ? this.invoiceStore.createRefundInventoryReversals(
          {
            tenantId: input.context.tenantId,
            refundId: input.sourceId,
            reversals: reversalRows,
          },
          input.transaction,
        )
      : this.invoiceStore.createVoidInventoryReversals(
          {
            tenantId: input.context.tenantId,
            invoiceId: input.sourceId,
            reversals: reversalRows,
          },
          input.transaction,
        );
  }
}

interface RequestedInventoryReversalLine {
  readonly invoiceLine: InvoiceWithDetailsRecord['lines'][number];
  readonly jobOrderLineId: string;
  readonly productId: string;
  readonly quantityReturned: string;
}

interface CostedInventoryReversalSegment {
  readonly jobOrderLineId: string;
  readonly productId: string;
  readonly quantityReturned: string;
  readonly unitCost: string;
  readonly originalSourceLayerId: string;
}

function groupInventoryConsumptionCosts(
  costs: readonly InvoiceInventoryConsumptionCostRecord[],
): ReadonlyMap<string, readonly InvoiceInventoryConsumptionCostRecord[]> {
  const grouped = new Map<string, InvoiceInventoryConsumptionCostRecord[]>();

  for (const cost of costs) {
    const group = grouped.get(cost.jobOrderLineId) ?? [];
    group.push(cost);
    grouped.set(cost.jobOrderLineId, group);
  }

  return grouped;
}

function buildInventoryReversalSegments(input: {
  readonly requestedLines: readonly RequestedInventoryReversalLine[];
  readonly costsByJobOrderLineId: ReadonlyMap<
    string,
    readonly InvoiceInventoryConsumptionCostRecord[]
  >;
  readonly returnedByJobOrderLineId: ReadonlyMap<string, bigint>;
}): readonly CostedInventoryReversalSegment[] {
  const segments: CostedInventoryReversalSegment[] = [];
  const runningReturnedByJobOrderLineId = new Map(input.returnedByJobOrderLineId);

  for (const requestedLine of input.requestedLines) {
    const costs = input.costsByJobOrderLineId
      .get(requestedLine.jobOrderLineId)
      ?.filter((cost) => cost.productId === requestedLine.productId);

    if (costs === undefined || costs.length === 0) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'inventory_reversal.lines',
          code: 'inventory_reversal_original_cost_missing',
          message: 'Original FIFO consumption costs are required before inventory can be returned.',
        },
      ]);
    }

    let quantityToReturn = parseQuantityThousandths(requestedLine.quantityReturned);
    let quantityToSkip = runningReturnedByJobOrderLineId.get(requestedLine.jobOrderLineId) ?? 0n;

    for (const cost of costs) {
      const consumedQuantity = parseQuantityThousandths(cost.quantityConsumed);

      if (quantityToSkip >= consumedQuantity) {
        quantityToSkip -= consumedQuantity;
        continue;
      }

      const availableFromCost = consumedQuantity - quantityToSkip;
      const returnedFromCost =
        availableFromCost < quantityToReturn ? availableFromCost : quantityToReturn;

      if (returnedFromCost > 0n) {
        segments.push({
          jobOrderLineId: requestedLine.jobOrderLineId,
          productId: requestedLine.productId,
          quantityReturned: formatQuantityThousandths(returnedFromCost),
          unitCost: cost.unitCost,
          originalSourceLayerId: cost.fifoLayerId,
        });
        quantityToReturn -= returnedFromCost;
      }

      quantityToSkip = 0n;

      if (quantityToReturn === 0n) {
        break;
      }
    }

    if (quantityToReturn > 0n) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'inventory_reversal.lines.return_quantity',
          code: 'inventory_reversal_exceeds_consumed_fifo_quantity',
          message:
            'Returned quantity cannot exceed the FIFO-consumed quantity recorded for the job order line.',
        },
      ]);
    }

    runningReturnedByJobOrderLineId.set(
      requestedLine.jobOrderLineId,
      (runningReturnedByJobOrderLineId.get(requestedLine.jobOrderLineId) ?? 0n) +
        parseQuantityThousandths(requestedLine.quantityReturned),
    );
  }

  return segments;
}

function formatQuantityThousandths(value: bigint): string {
  const wholePart = value / 1000n;
  const fractionalPart = value % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
}

function assertInvoicePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function assertAnyInvoicePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permissions: readonly string[],
): void {
  if (
    isShopOwner ||
    permissions.some((permission) => context.effectivePermissions.includes(permission))
  ) {
    return;
  }

  throw GarageOsApiException.forbidden(permissions.join(' or '));
}

function assertAllRequestedJobOrdersFound(
  requestedIds: readonly string[],
  jobOrders: readonly InvoiceDraftJobOrderRecord[],
): void {
  if (jobOrders.length === requestedIds.length) {
    return;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'job_order_ids',
      code: 'invoice_job_order_not_found',
      message: 'Every requested job order must exist in the current tenant.',
    },
  ]);
}

function assertDraftJobOrdersEligible(jobOrders: readonly InvoiceDraftJobOrderRecord[]): void {
  const blocked = jobOrders.find(
    (jobOrder) => jobOrder.status === 'cancelled' || jobOrder.status === 'released',
  );

  if (blocked === undefined) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Cancelled or released job orders cannot be used to create a draft invoice.',
    [
      {
        field: 'job_order_ids',
        code: 'invoice_job_order_status_not_eligible',
        message: 'Job orders must not be cancelled or released when the invoice is created.',
      },
    ],
  );
}

function assertDraftLinesSelected(
  requestedLineIds: readonly string[] | null,
  lines: readonly InvoiceDraftJobOrderLineRecord[],
): void {
  if (lines.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'job_order_line_ids',
        code: 'invoice_requires_billable_lines',
        message: 'At least one billable active job order line is required.',
      },
    ]);
  }

  if (requestedLineIds === null || lines.length === requestedLineIds.length) {
    return;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'job_order_line_ids',
      code: 'invoice_job_order_line_not_found',
      message: 'Every requested job order line must belong to the selected job orders.',
    },
  ]);
}

function assertDraftLinesEligible(lines: readonly InvoiceDraftJobOrderLineRecord[]): void {
  const inactiveLine = lines.find((line) => line.status === 'cancelled');

  if (inactiveLine !== undefined) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Cancelled job order lines cannot be reserved on a draft invoice.',
      [
        {
          field: 'job_order_line_ids',
          code: 'invoice_job_order_line_not_active',
          message: 'Cancelled job order lines cannot be reserved on a draft invoice.',
        },
      ],
    );
  }
}

function assertNoOverbilling(
  lines: readonly InvoiceDraftJobOrderLineRecord[],
  allocationTotals: readonly BillingAllocationTotalRecord[],
): void {
  const totalsByLineId = new Map(
    allocationTotals.map((total) => [total.jobOrderLineId, total] as const),
  );

  for (const line of lines) {
    const total = totalsByLineId.get(line.id);
    const allocatedQuantity = total?.allocatedQuantity ?? '0.000';
    const remainingQuantity = subtractQuantity(line.quantity, allocatedQuantity);

    if (remainingQuantity !== '0.000' && Number(remainingQuantity) > 0) {
      continue;
    }

    throwOverbillingBlocked();
  }
}

function assertBillingAllocationsCreated(expected: number, actual: number): void {
  if (actual === expected) {
    return;
  }

  throwOverbillingBlocked();
}

function throwOverbillingBlocked(): never {
  throw GarageOsApiException.invoiceOverbillingBlocked([
    {
      field: 'job_order_line_ids',
      code: 'invoice_job_order_line_overbilled',
      message:
        'Draft invoice creation cannot reserve more than the remaining billable line quantity or amount.',
    },
  ]);
}

function assertInvoiceCurrentStatusAllowed(
  invoice: InvoiceRecord,
  allowedStatuses: readonly InvoiceStatus[],
  toStatus: InvoiceStatus,
): void {
  if (allowedStatuses.includes(invoice.status)) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    `Invoice cannot transition from ${invoice.status} to ${toStatus}.`,
    [
      {
        field: 'invoice_id',
        code: 'invoice_status_not_eligible',
        message: `Invoice cannot transition from ${invoice.status} to ${toStatus}.`,
      },
    ],
  );
}

function assertInvoiceHasNoPaymentsOrRefunds(invoice: InvoiceRecord, action: string): void {
  if (
    parseMoneyCents(invoice.amountPaid) === 0n &&
    parseMoneyCents(invoice.amountRefunded) === 0n
  ) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    `Invoice cannot be ${action}led after payment or refund activity.`,
    [
      {
        field: 'invoice_id',
        code: `invoice_${action}_blocked_by_payment_activity`,
        message: 'Payment or refund activity exists for this invoice.',
      },
    ],
  );
}

function assertInvoicePaymentsRefundedBeforeVoid(invoice: InvoiceRecord): void {
  if (parseMoneyCents(invoice.amountPaid) <= parseMoneyCents(invoice.amountRefunded)) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Paid invoices cannot be voided until all payments are refunded.',
    [
      {
        field: 'invoice_id',
        code: 'invoice_void_blocked_by_unrefunded_payments',
        message: 'Refund all payments before voiding this invoice.',
      },
    ],
  );
}

function assertInvoiceCanReceivePayment(invoice: InvoiceRecord): void {
  if (
    invoice.status === INVOICE_STATUSES.PENDING ||
    invoice.status === INVOICE_STATUSES.PARTIALLY_PAID ||
    invoice.status === INVOICE_STATUSES.OVERDUE
  ) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Invoice cannot receive payments in its current status.',
    [
      {
        field: 'invoice_id',
        code: 'invoice_status_not_collectible',
        message: 'Draft, cancelled, voided, refunded, and paid invoices cannot receive payments.',
      },
    ],
  );
}

function assertPaymentDoesNotOverpay(amount: string, remainingCollectibleBalance: string): void {
  if (parseMoneyCents(amount) <= parseMoneyCents(remainingCollectibleBalance)) {
    return;
  }

  throw GarageOsApiException.invoiceOverpaymentBlocked([
    {
      field: 'amount',
      code: 'invoice_payment_exceeds_remaining_balance',
      message: 'Payment amount cannot exceed invoice remaining collectible balance.',
    },
  ]);
}

function assertInvoiceCanReceiveRefund(invoice: InvoiceRecord): void {
  if (
    invoice.status === INVOICE_STATUSES.PENDING ||
    invoice.status === INVOICE_STATUSES.PARTIALLY_PAID ||
    invoice.status === INVOICE_STATUSES.PAID ||
    invoice.status === INVOICE_STATUSES.OVERDUE
  ) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Invoice cannot receive refunds in its current status.',
    [
      {
        field: 'payment_id',
        code: 'invoice_status_not_refundable',
        message: 'Draft, cancelled, voided, and refunded invoices cannot receive payment refunds.',
      },
    ],
  );
}

function assertRefundDoesNotExceedRefundable(amount: string, refundableAmount: string): void {
  if (parseMoneyCents(amount) <= parseMoneyCents(refundableAmount)) {
    return;
  }

  throw GarageOsApiException.refundAmountExceedsRefundable([
    {
      field: 'amount',
      code: 'refund_amount_exceeds_payment_refundable_amount',
      message: 'Refund amount cannot exceed payment refundable amount.',
    },
  ]);
}

function calculateInvoicePaymentStatus(
  invoice: InvoiceRecord,
  remainingCollectibleBalance: string,
): InvoiceStatus {
  if (parseMoneyCents(remainingCollectibleBalance) === 0n) {
    return INVOICE_STATUSES.PAID;
  }

  if (
    parseMoneyCents(invoice.amountPaid) > 0n ||
    invoice.status === INVOICE_STATUSES.PARTIALLY_PAID
  ) {
    return INVOICE_STATUSES.PARTIALLY_PAID;
  }

  if (invoice.status === INVOICE_STATUSES.OVERDUE) {
    return INVOICE_STATUSES.OVERDUE;
  }

  return INVOICE_STATUSES.PARTIALLY_PAID;
}

function calculateInvoiceRefundState(input: {
  readonly invoice: InvoiceRecord;
  readonly refundAmount: string;
  readonly nextAmountRefunded: string;
  readonly closeInvoiceAfterRefund: boolean;
  readonly changedAt: Date;
}): {
  readonly remainingCollectibleBalance: string;
  readonly status: InvoiceStatus;
  readonly refundedAt: Date | null;
} {
  if (input.closeInvoiceAfterRefund) {
    return {
      remainingCollectibleBalance: '0.00',
      status: INVOICE_STATUSES.REFUNDED,
      refundedAt: input.changedAt,
    };
  }

  const remainingCollectibleBalance = addMoney(
    input.invoice.remainingCollectibleBalance,
    input.refundAmount,
  );
  const netPaidCents =
    parseMoneyCents(input.invoice.amountPaid) - parseMoneyCents(input.nextAmountRefunded);

  if (parseMoneyCents(remainingCollectibleBalance) === 0n) {
    return {
      remainingCollectibleBalance,
      status: INVOICE_STATUSES.PAID,
      refundedAt: null,
    };
  }

  if (
    input.invoice.dueDate !== null &&
    input.invoice.dueDate.getTime() < input.changedAt.getTime()
  ) {
    return {
      remainingCollectibleBalance,
      status: INVOICE_STATUSES.OVERDUE,
      refundedAt: null,
    };
  }

  return {
    remainingCollectibleBalance,
    status: netPaidCents > 0n ? INVOICE_STATUSES.PARTIALLY_PAID : INVOICE_STATUSES.PENDING,
    refundedAt: null,
  };
}

function assertSingleValue(
  values: readonly string[],
  detail: { readonly field: string; readonly code: string; readonly message: string },
): string {
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 1 && uniqueValues[0] !== undefined) {
    return uniqueValues[0];
  }

  throw GarageOsApiException.validationFailed([detail]);
}

function normalizeInvoiceLevelDiscount(
  discount: CreateDraftInvoiceRequest['invoice_level_discount'] | null | undefined,
): InvoiceLevelDiscountInput | null {
  if (discount == null) {
    return null;
  }

  if (discount.type === 'fixed') {
    return discount.reason === undefined
      ? {
          type: 'fixed',
          amount: discount.amount,
        }
      : {
          type: 'fixed',
          amount: discount.amount,
          reason: discount.reason,
        };
  }

  return discount.reason === undefined
    ? {
        type: 'percentage',
        percentage: discount.percentage,
      }
    : {
        type: 'percentage',
        percentage: discount.percentage,
        reason: discount.reason,
      };
}

function calculateDraftInvoice(input: {
  readonly lines: readonly InvoiceDraftJobOrderLineRecord[];
  readonly allocationTotalsByLineId: ReadonlyMap<string, BillingAllocationTotalRecord>;
  readonly invoiceSettings: InvoiceSettingsRecord;
  readonly invoiceLevelDiscount: CreateDraftInvoiceRequest['invoice_level_discount'] | null;
}): ReturnType<typeof calculateInvoice> {
  const calculationInput: CalculateInvoiceInput = {
    taxSettings: {
      taxProfile: input.invoiceSettings.taxProfile,
      taxMode: input.invoiceSettings.taxMode,
      vatRate: input.invoiceSettings.vatRate,
    },
    invoiceLevelDiscount: normalizeInvoiceLevelDiscount(input.invoiceLevelDiscount),
    lines: input.lines.map((line, index) => {
      const allocationTotal = input.allocationTotalsByLineId.get(line.id);
      const remainingQuantity = subtractQuantity(
        line.quantity,
        allocationTotal?.allocatedQuantity ?? '0.000',
      );

      return {
        originatingJobOrderLineId: line.id,
        lineType: line.lineType as InvoiceLineType,
        productId: line.productId,
        serviceId: line.serviceId,
        description: line.description,
        quantity: remainingQuantity,
        unitPrice: line.unitPrice,
        lineDiscountAmount: '0.00',
        lineOrder: index,
      };
    }),
  };

  try {
    return calculateInvoice(calculationInput);
  } catch (error) {
    if (error instanceof InvoiceCalculationError) {
      throw GarageOsApiException.validationFailed([...error.details]);
    }

    throw error;
  }
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function toInvoiceDetailResponse(invoice: InvoiceWithDetailsRecord): InvoiceDetailResponse {
  return {
    invoice: toInvoiceResponse(invoice.invoice),
    job_order_ids: invoice.jobOrders.map((jobOrder) => jobOrder.jobOrderId),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      originating_job_order_line_id: line.originatingJobOrderLineId,
      line_type: line.lineType,
      product_id: line.productId,
      service_id: line.serviceId,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_discount_amount: line.lineDiscountAmount,
      allocated_invoice_discount_amount: line.allocatedInvoiceDiscountAmount,
      taxable_base_amount: line.taxableBaseAmount,
      tax_amount: line.taxAmount,
      line_total: line.lineTotal,
      line_order: line.lineOrder,
    })),
  };
}

function toInvoiceResponse(invoice: InvoiceRecord): InvoiceResponse {
  return {
    id: invoice.id,
    branch_id: invoice.branchId,
    customer_id: invoice.customerId,
    invoice_number: invoice.invoiceNumber,
    invoice_date: invoice.invoiceDate.toISOString().slice(0, 10),
    due_date: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    status: invoice.status,
    tax_profile: invoice.taxProfile,
    tax_mode: invoice.taxMode,
    vat_rate: invoice.vatRate,
    subtotal_amount: invoice.subtotalAmount,
    discount_amount: invoice.discountAmount,
    tax_amount: invoice.taxAmount,
    total_amount: invoice.totalAmount,
    amount_paid: invoice.amountPaid,
    amount_refunded: invoice.amountRefunded,
    remaining_collectible_balance: invoice.remainingCollectibleBalance,
    discount_reason: invoice.discountReason,
    lock_version: invoice.lockVersion,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
  };
}

function toInvoiceStatusEventResponse(
  statusEvent: InvoiceStatusEventRecord,
): InvoiceStatusEventResponse {
  return {
    id: statusEvent.id,
    invoice_id: statusEvent.invoiceId,
    from_status: statusEvent.fromStatus,
    to_status: statusEvent.toStatus,
    reason: statusEvent.reason,
    created_by_user_id: statusEvent.createdByUserId,
    created_at: statusEvent.createdAt.toISOString(),
  };
}

function toInvoicePaymentResponse(payment: InvoicePaymentRecord): InvoicePaymentResponse {
  return {
    id: payment.id,
    invoice_id: payment.invoiceId,
    amount: payment.amount,
    refundable_amount: payment.refundableAmount,
    payment_date: payment.paymentDate.toISOString().slice(0, 10),
    payment_method: payment.paymentMethod,
    reference_number: payment.referenceNumber,
    notes: payment.notes,
    created_at: payment.createdAt.toISOString(),
  };
}

function toInvoiceReceiptResponse(receipt: InvoiceReceiptRecord): InvoiceReceiptResponse {
  return {
    id: receipt.id,
    invoice_id: receipt.invoiceId,
    payment_id: receipt.paymentId,
    receipt_number: receipt.receiptNumber,
    amount: receipt.amount,
    payment_method: receipt.paymentMethod,
    issued_at: receipt.issuedAt.toISOString(),
  };
}

function toInvoiceRefundResponse(refund: InvoiceRefundRecord): InvoiceRefundResponse {
  return {
    id: refund.id,
    invoice_id: refund.invoiceId,
    payment_id: refund.paymentId,
    amount: refund.amount,
    reason: refund.reason,
    collection_should_continue: refund.collectionShouldContinue,
    close_invoice_after_refund: refund.closeInvoiceAfterRefund,
    inventory_reversal_selected: refund.inventoryReversalSelected,
    status: refund.status,
    created_at: refund.createdAt.toISOString(),
  };
}

function toInvoiceInventoryReversalResponse(
  reversal: InvoiceInventoryReversalRecord,
): InvoiceInventoryReversalResponse {
  return {
    id: reversal.id,
    job_order_line_id: reversal.jobOrderLineId,
    product_id: reversal.productId,
    quantity_returned: reversal.quantityReturned,
    inventory_ledger_entry_id: reversal.inventoryLedgerEntryId,
    fifo_layer_id: reversal.fifoLayerId,
    created_at: reversal.createdAt.toISOString(),
  };
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.map((id) => id.trim()))];
}

function subtractQuantity(left: string, right: string): string {
  const difference = parseQuantityThousandths(left) - parseQuantityThousandths(right);
  const wholePart = difference / 1000n;
  const fractionalPart = difference % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
}

function addMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) + parseMoneyCents(right));
}

function multiplyQuantityByMoney(quantity: string, money: string): string {
  return formatMoneyCents((parseQuantityThousandths(quantity) * parseMoneyCents(money)) / 1000n);
}

function subtractMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) - parseMoneyCents(right));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const fractionalPart = value % 100n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(2, '0')}`;
}

function parseQuantityThousandths(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(3, '0').slice(0, 3);

  return BigInt(wholePart) * 1000n + BigInt(normalizedFractionalPart);
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(2, '0').slice(0, 2);

  return BigInt(wholePart) * 100n + BigInt(normalizedFractionalPart);
}
