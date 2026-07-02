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
import type { CreateDraftInvoiceRequest, ListInvoicesQuery } from '../api/invoice.schemas';
import {
  BILLING_ALLOCATION_STATUSES,
  type InvoiceLineType,
  type InvoiceRecord,
  type InvoiceStatusEventRecord,
  type InvoiceWithDetailsRecord,
} from './invoice.records';
import {
  InvoiceStore,
  type BillingAllocationTotalRecord,
  type InvoiceDraftJobOrderLineRecord,
  type InvoiceDraftJobOrderRecord,
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
      const invoiceLines = lines.map((line, index) => {
        const allocationTotal = allocationTotalsByLineId.get(line.id);
        const remainingQuantity = subtractQuantity(
          line.quantity,
          allocationTotal?.allocatedQuantity ?? '0.000',
        );

        return buildInvoiceLineInput(
          line,
          remainingQuantity,
          index,
          invoiceSettings.vatRate,
          invoiceSettings.taxMode,
        );
      });
      const subtotalAmount = sumMoneyStrings(invoiceLines.map((line) => line.taxableBaseAmount));
      const taxAmount = sumMoneyStrings(invoiceLines.map((line) => line.taxAmount));
      const totalAmount = sumMoneyStrings(invoiceLines.map((line) => line.lineTotal));

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
          subtotalAmount,
          discountAmount: '0.00',
          taxAmount,
          totalAmount,
          remainingCollectibleBalance: totalAmount,
          discountReason: null,
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
          toStatus: 'draft',
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

function buildInvoiceLineInput(
  line: InvoiceDraftJobOrderLineRecord,
  remainingQuantity: string,
  lineOrder: number,
  vatRate: string,
  taxMode: InvoiceRecord['taxMode'],
) {
  const netAmount = multiplyMoneyByQuantity(line.unitPrice, remainingQuantity);
  const taxAmount = taxMode === 'no_tax' ? '0.00' : calculateTaxAmount(netAmount, vatRate, taxMode);
  const lineTotal =
    taxMode === 'tax_inclusive' ? netAmount : sumMoneyStrings([netAmount, taxAmount]);

  return {
    id: randomUUID(),
    originatingJobOrderLineId: line.id,
    lineType: line.lineType,
    productId: line.productId,
    serviceId: line.serviceId,
    description: line.description,
    quantity: remainingQuantity,
    unitPrice: line.unitPrice,
    lineDiscountAmount: '0.00',
    allocatedInvoiceDiscountAmount: '0.00',
    taxableBaseAmount:
      taxMode === 'tax_inclusive' ? subtractMoney(lineTotal, taxAmount) : netAmount,
    taxAmount,
    lineTotal,
    lineOrder,
  };
}

function calculateTaxAmount(
  amount: string,
  vatRate: string,
  taxMode: InvoiceRecord['taxMode'],
): string {
  const amountCents = parseMoneyCents(amount);
  const vatBasisPoints = BigInt(Math.round(Number(vatRate) * 10000));

  if (taxMode === 'tax_inclusive') {
    const divisor = 10000n + vatBasisPoints;
    return formatMoneyCents((amountCents * vatBasisPoints + divisor / 2n) / divisor);
  }

  return formatMoneyCents((amountCents * vatBasisPoints + 5000n) / 10000n);
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

function multiplyMoneyByQuantity(money: string, quantity: string): string {
  const cents = parseMoneyCents(money);
  const thousandths = parseQuantityThousandths(quantity);

  return formatMoneyCents((cents * thousandths + 500n) / 1000n);
}

function sumMoneyStrings(values: readonly string[]): string {
  return formatMoneyCents(values.reduce((total, value) => total + parseMoneyCents(value), 0n));
}

function subtractMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) - parseMoneyCents(right));
}

function subtractQuantity(left: string, right: string): string {
  const difference = parseQuantityThousandths(left) - parseQuantityThousandths(right);
  const wholePart = difference / 1000n;
  const fractionalPart = difference % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(2, '0').slice(0, 2);

  return BigInt(wholePart) * 100n + BigInt(normalizedFractionalPart);
}

function parseQuantityThousandths(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(3, '0').slice(0, 3);

  return BigInt(wholePart) * 1000n + BigInt(normalizedFractionalPart);
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const fractionalPart = value % 100n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(2, '0')}`;
}
