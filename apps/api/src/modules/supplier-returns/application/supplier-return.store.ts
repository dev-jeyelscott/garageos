import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type SupplierReturnStatus = 'draft' | 'posted' | 'cancelled';
export type SupplierReturnStatusFilter = SupplierReturnStatus | 'all';
export type SupplierReturnBranchStatus = 'active' | 'inactive';
export type SupplierReturnSupplierStatus = 'active' | 'inactive';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface SupplierReturnLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly returnedQuantity: string;
  readonly unitCost: string;
  readonly totalCost: string;
}

export interface SupplierReturnRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly branchName: string | null;
  readonly branchStatus: SupplierReturnBranchStatus;
  readonly supplierId: string;
  readonly supplierName: string | null;
  readonly supplierStatus: SupplierReturnSupplierStatus;
  readonly originalReceivingId: string | null;
  readonly status: SupplierReturnStatus;
  readonly reason: string;
  readonly financialValue: string;
  readonly supplierCreditId: string | null;
  readonly postedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly lines: readonly SupplierReturnLineRecord[];
}

export interface SupplierReturnListCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ListSupplierReturnsInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly supplierId: string | null;
  readonly status: SupplierReturnStatusFilter;
  readonly limit: number;
  readonly cursor: SupplierReturnListCursor | null;
}

export interface CreateSupplierReturnLineInput {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly productId: string;
  readonly returnedQuantity: string;
  readonly unitCost: string;
  readonly totalCost: string;
}

export interface CreateSupplierReturnInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly supplierId: string;
  readonly originalReceivingId: string | null;
  readonly reason: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly lines: readonly CreateSupplierReturnLineInput[];
}

export interface UpdateDraftSupplierReturnInput {
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly branchId: string;
  readonly supplierId: string;
  readonly originalReceivingId: string | null;
  readonly reason: string;
  readonly lines: readonly CreateSupplierReturnLineInput[];
}

export interface CancelSupplierReturnInput {
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly cancelledAt: Date;
}

export interface UpdatePostedSupplierReturnLineInput {
  readonly tenantId: string;
  readonly supplierReturnLineId: string;
  readonly unitCost: string;
  readonly totalCost: string;
}

export interface PostSupplierReturnInput {
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly financialValue: string;
  readonly supplierCreditId: string | null;
  readonly postedAt: Date;
}

export interface ReceivingTraceLineRecord {
  readonly receivingLineId: string;
  readonly productId: string;
  readonly receivedQuantity: string;
  readonly receivedUnitCost: string;
  readonly alreadyReturnedQuantity: string;
}

export interface ReceivingTraceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly supplierId: string;
  readonly purchaseOrderId: string;
  readonly paymentTerms: 'cash' | 'credit';
  readonly lines: readonly ReceivingTraceLineRecord[];
}

export interface CreateSupplierCreditInput {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly branchId: string;
  readonly amount: string;
  readonly reason: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface SupplierCreditRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly branchId: string | null;
  readonly amount: string;
  readonly reason: string;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export abstract class SupplierReturnStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listSupplierReturns(
    input: ListSupplierReturnsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly SupplierReturnRecord[]>;

  abstract findSupplierReturnById(
    tenantId: string,
    supplierReturnId: string,
    client?: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null>;

  abstract lockSupplierReturnById(
    tenantId: string,
    supplierReturnId: string,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null>;

  abstract createSupplierReturn(
    input: CreateSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord>;

  abstract updateDraftSupplierReturn(
    input: UpdateDraftSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null>;

  abstract cancelDraftSupplierReturn(
    input: CancelSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null>;

  abstract updatePostedSupplierReturnLine(
    input: UpdatePostedSupplierReturnLineInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnLineRecord | null>;

  abstract markSupplierReturnPosted(
    input: PostSupplierReturnInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierReturnRecord | null>;

  abstract getReceivingTrace(
    tenantId: string,
    receivingId: string,
    client: DatabaseQueryClient,
  ): Promise<ReceivingTraceRecord | null>;

  abstract getSupplierPayableBalanceForUpdate(
    tenantId: string,
    supplierId: string,
    client: DatabaseQueryClient,
  ): Promise<string>;

  abstract createSupplierCredit(
    input: CreateSupplierCreditInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierCreditRecord>;
}
