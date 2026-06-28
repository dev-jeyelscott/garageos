import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type EstimateStatus =
  | 'draft'
  | 'presented'
  | 'approved'
  | 'converted'
  | 'cancelled'
  | 'expired';

export type EstimateApprovalMethod = 'verbal' | 'sms' | 'email' | 'signed_document' | 'other';

export type EstimateLineType = 'service' | 'labor' | 'part';

export interface EstimateLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly estimateId: string;
  readonly lineType: EstimateLineType;
  readonly serviceId: string | null;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

export interface EstimateRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string | null;
  readonly estimateNumber: string;
  readonly status: EstimateStatus;
  readonly validUntilDate: string | null;
  readonly approvalMethod: EstimateApprovalMethod | null;
  readonly approvedByCustomerName: string | null;
  readonly approvedAt: Date | null;
  readonly convertedJobOrderId: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly lockVersion: number;
  readonly lines: readonly EstimateLineRecord[];
}

export interface EstimateLineInput {
  readonly id: string;
  readonly tenantId: string;
  readonly estimateId: string;
  readonly lineType: Exclude<EstimateLineType, 'part'>;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

export interface CreateEstimateInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string | null;
  readonly estimateNumber: string;
  readonly validUntilDate: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly lines: readonly Omit<EstimateLineInput, 'tenantId' | 'estimateId'>[];
}

export interface UpdateEstimateInput {
  readonly tenantId: string;
  readonly estimateId: string;
  readonly validUntilDate: string | null;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
  readonly lines: readonly Omit<EstimateLineInput, 'tenantId' | 'estimateId'>[];
}

export interface PresentEstimateInput {
  readonly tenantId: string;
  readonly estimateId: string;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ApproveEstimateInput {
  readonly tenantId: string;
  readonly estimateId: string;
  readonly expectedLockVersion: number;
  readonly approvalMethod: EstimateApprovalMethod;
  readonly approvedByCustomerName: string;
  readonly approvedAt: Date;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ListEstimatesInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly status: EstimateStatus | undefined;
  readonly customerId: string | undefined;
  readonly motorcycleId: string | undefined;
  readonly normalizedSearch: string | null;
  readonly limit: number;
}

export interface EstimateNumberSequenceInput {
  readonly tenantId: string;
  readonly datePart: string;
}

export abstract class EstimateStore {
  abstract getTenantTimezone(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract lockEstimateNumberSequence(
    input: EstimateNumberSequenceInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findLatestEstimateNumberForDate(
    input: EstimateNumberSequenceInput,
    client: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract listEstimates(input: ListEstimatesInput): Promise<readonly EstimateRecord[]>;

  abstract findEstimateById(
    tenantId: string,
    estimateId: string,
    client?: DatabaseQueryClient,
  ): Promise<EstimateRecord | null>;

  abstract findEstimateByIdForUpdate(
    tenantId: string,
    estimateId: string,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null>;

  abstract createEstimate(
    input: CreateEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord>;

  abstract updateDraftEstimate(
    input: UpdateEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null>;

  abstract presentEstimate(
    input: PresentEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null>;

  abstract approveEstimate(
    input: ApproveEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null>;

  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;

  abstract activeBranchExists(
    tenantId: string,
    branchId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeCustomerExists(
    tenantId: string,
    customerId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeMotorcycleBelongsToCustomer(
    input: {
      readonly tenantId: string;
      readonly motorcycleId: string;
      readonly customerId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeServiceExists(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;
}
