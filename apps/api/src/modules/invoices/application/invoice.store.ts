import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  JobOrderLineStatus,
  JobOrderLineType,
  JobOrderStatus,
} from '../../job-orders/application/job-order.store';
import type {
  BillingAllocationStatus,
  InvoiceBillingAllocationRecord,
  InvoiceJobOrderRecord,
  InvoiceLineRecord,
  InvoiceLineType,
  InvoicePaymentRecord,
  InvoiceReceiptRecord,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceStatusEventRecord,
  InvoiceWithDetailsRecord,
  TaxMode,
  TaxProfile,
} from './invoice.records';

export interface InvoiceSettingsRecord {
  readonly invoicePrefix: string;
  readonly taxProfile: TaxProfile;
  readonly taxMode: TaxMode;
  readonly vatRate: string;
  readonly defaultInvoiceDueDays: number;
  readonly timezone: string;
}

export interface InvoiceDraftJobOrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly status: JobOrderStatus;
}

export interface InvoiceDraftJobOrderLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineType: JobOrderLineType;
  readonly serviceId: string | null;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly status: JobOrderLineStatus;
  readonly lineOrder: number;
}

export interface BillingAllocationTotalRecord {
  readonly jobOrderLineId: string;
  readonly allocatedQuantity: string;
  readonly allocatedAmount: string;
}

export interface CreateDraftInvoiceInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: Date;
  readonly dueDate: Date | null;
  readonly taxProfile: TaxProfile | null;
  readonly taxMode: TaxMode | null;
  readonly vatRate: string | null;
  readonly subtotalAmount: string;
  readonly discountAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly remainingCollectibleBalance: string;
  readonly discountReason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface CreateInvoiceJobOrderLinkInput {
  readonly id: string;
  readonly jobOrderId: string;
  readonly createdAt: Date;
}

export interface CreateInvoiceJobOrderLinksInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly jobOrders: readonly CreateInvoiceJobOrderLinkInput[];
}

export interface CreateInvoiceLineInput {
  readonly id: string;
  readonly originatingJobOrderLineId: string | null;
  readonly lineType: InvoiceLineType;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineDiscountAmount: string;
  readonly allocatedInvoiceDiscountAmount: string;
  readonly taxableBaseAmount: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

export interface CreateInvoiceLinesInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly lines: readonly CreateInvoiceLineInput[];
}

export interface CreateInvoiceBillingAllocationInput {
  readonly id: string;
  readonly invoiceLineId: string;
  readonly jobOrderLineId: string;
  readonly allocatedQuantity: string | null;
  readonly allocatedAmount: string | null;
  readonly status: BillingAllocationStatus;
  readonly createdAt: Date;
}

export interface CreateInvoiceBillingAllocationsInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly allocations: readonly CreateInvoiceBillingAllocationInput[];
}

export interface ReplaceDraftInvoiceLinesInput extends CreateInvoiceLinesInput {}

export interface FindInvoiceWithDetailsInput {
  readonly tenantId: string;
  readonly invoiceId: string;
}

export interface LockInvoiceWithDetailsForUpdateInput extends FindInvoiceWithDetailsInput {}

export interface InsertInvoiceStatusEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly fromStatus: InvoiceStatus | null;
  readonly toStatus: InvoiceStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface ListInvoicesInput {
  readonly tenantId: string;
  readonly branchId?: string | null;
  readonly status?: InvoiceStatus | null;
  readonly customerId?: string | null;
  readonly fromDate?: Date | null;
  readonly toDate?: Date | null;
  readonly limit: number;
}

export interface FindLatestInvoiceNumberForDateInput {
  readonly tenantId: string;
  readonly datePrefix: string;
}

export interface UpdateInvoiceWorkflowStatusInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly fromStatus: InvoiceStatus;
  readonly toStatus: InvoiceStatus;
  readonly changedAt: Date;
  readonly issuedAt?: Date;
  readonly cancelledAt?: Date;
  readonly voidedAt?: Date;
}

export interface UpdateBillingAllocationStatusesInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly fromStatuses: readonly BillingAllocationStatus[];
  readonly toStatus: BillingAllocationStatus;
  readonly changedAt: Date;
}

export interface CreateInvoicePaymentInput {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly amount: string;
  readonly paymentDate: Date;
  readonly paymentMethod: InvoicePaymentRecord['paymentMethod'];
  readonly referenceNumber: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface CreateInvoiceReceiptInput {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly paymentId: string;
  readonly receiptNumber: string;
  readonly amount: string;
  readonly paymentMethod: InvoicePaymentRecord['paymentMethod'];
  readonly issuedAt: Date;
  readonly createdByUserId: string;
}

export interface UpdateInvoicePaymentTotalsInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly amountPaid: string;
  readonly remainingCollectibleBalance: string;
  readonly status: InvoiceStatus;
  readonly changedAt: Date;
}

export interface AllocateReceiptNumberInput {
  readonly tenantId: string;
}

export abstract class InvoiceStore {
  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;

  abstract lockInvoiceSettingsForUpdate(
    tenantId: string,
    client: DatabaseQueryClient,
  ): Promise<InvoiceSettingsRecord | null>;

  abstract findDraftJobOrdersForUpdate(
    tenantId: string,
    jobOrderIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceDraftJobOrderRecord[]>;

  abstract findDraftJobOrderLinesForUpdate(
    tenantId: string,
    jobOrderLineIds: readonly string[] | null,
    jobOrderIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceDraftJobOrderLineRecord[]>;

  abstract listOpenBillingAllocationTotals(
    tenantId: string,
    jobOrderLineIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly BillingAllocationTotalRecord[]>;

  abstract createDraftInvoice(
    input: CreateDraftInvoiceInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceRecord>;

  abstract createInvoiceJobOrderLinks(
    input: CreateInvoiceJobOrderLinksInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceJobOrderRecord[]>;

  abstract createInvoiceLines(
    input: CreateInvoiceLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceLineRecord[]>;

  abstract createBillingAllocations(
    input: CreateInvoiceBillingAllocationsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceBillingAllocationRecord[]>;

  abstract replaceDraftInvoiceLines(
    input: ReplaceDraftInvoiceLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceLineRecord[]>;

  abstract findInvoiceWithDetails(
    input: FindInvoiceWithDetailsInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceWithDetailsRecord | null>;

  abstract lockInvoiceWithDetailsForUpdate(
    input: LockInvoiceWithDetailsForUpdateInput,
    client: DatabaseQueryClient,
  ): Promise<InvoiceWithDetailsRecord | null>;

  abstract updateInvoiceWorkflowStatus(
    input: UpdateInvoiceWorkflowStatusInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceRecord | null>;

  abstract updateBillingAllocationStatuses(
    input: UpdateBillingAllocationStatusesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceBillingAllocationRecord[]>;

  abstract createPayment(
    input: CreateInvoicePaymentInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoicePaymentRecord>;

  abstract createReceipt(
    input: CreateInvoiceReceiptInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceReceiptRecord>;

  abstract updateInvoicePaymentTotals(
    input: UpdateInvoicePaymentTotalsInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceRecord | null>;

  abstract allocateReceiptNumber(
    input: AllocateReceiptNumberInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract insertStatusEvent(
    input: InsertInvoiceStatusEventInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceStatusEventRecord>;

  abstract listStatusEvents(
    input: FindInvoiceWithDetailsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceStatusEventRecord[]>;

  abstract listInvoices(
    input: ListInvoicesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceRecord[]>;

  abstract findLatestInvoiceNumberForDate(
    input: FindLatestInvoiceNumberForDateInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;
}
