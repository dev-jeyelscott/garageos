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
  CreateDraftInvoiceRequest,
  IssueInvoiceRequest,
  ListInvoicesQuery,
  VoidInvoiceRequest,
} from '../api/invoice.schemas';
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
  type InvoiceLineType,
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
  type InvoiceSettingsRecord,
} from './invoice.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

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

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(InvoiceStore)
    private readonly invoiceStore: InvoiceStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
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
    });
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
        afterJson: toInvoiceDetailResponse(updated),
        reason: input.reason,
        client: transaction,
      });

      return toInvoiceDetailResponse(updated);
    });
  }
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

function uniqueIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.map((id) => id.trim()))];
}

function subtractQuantity(left: string, right: string): string {
  const difference = parseQuantityThousandths(left) - parseQuantityThousandths(right);
  const wholePart = difference / 1000n;
  const fractionalPart = difference % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
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
