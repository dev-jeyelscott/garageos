import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  BillingAllocationStatus,
  InvoiceBillingAllocationRecord,
  InvoiceJobOrderRecord,
  InvoiceLineRecord,
  InvoiceLineType,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceStatusEventRecord,
  InvoiceWithDetailsRecord,
  TaxMode,
  TaxProfile,
} from './invoice.records';

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

export abstract class InvoiceStore {
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

  abstract insertStatusEvent(
    input: InsertInvoiceStatusEventInput,
    client?: DatabaseQueryClient,
  ): Promise<InvoiceStatusEventRecord>;

  abstract listInvoices(
    input: ListInvoicesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InvoiceRecord[]>;

  abstract findLatestInvoiceNumberForDate(
    input: FindLatestInvoiceNumberForDateInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;
}
