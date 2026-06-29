import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  InventoryAdjustmentLineRecord,
  InventoryAdjustmentListRecord,
  InventoryAdjustmentRecord,
  InventoryAdjustmentStatus,
  InventoryAdjustmentStatusEventRecord,
  InventoryAdjustmentType,
  InventoryAdjustmentWithLinesRecord,
} from './inventory-adjustment.records';

export interface CreateDraftAdjustmentInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly adjustmentNumber: string;
  readonly reason: string;
  readonly valueImpact: string;
  readonly approvalRequired: boolean;
  readonly requestedByUserId: string;
  readonly createdAt: Date;
}

export interface CreateDraftAdjustmentLinesInput {
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly lines: readonly CreateDraftAdjustmentLineInput[];
}

export interface CreateDraftAdjustmentLineInput {
  readonly id: string;
  readonly productId: string;
  readonly adjustmentType: InventoryAdjustmentType;
  readonly quantityDifference: string | null;
  readonly finalCountedQuantity: string | null;
  readonly unitCost: string | null;
  readonly estimatedFifoCost: string | null;
}

export interface UpdateDraftAdjustmentInput {
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly reason: string;
  readonly valueImpact: string;
  readonly approvalRequired: boolean;
  readonly lockVersion?: number;
  readonly updatedAt: Date;
}

export interface ReplaceDraftAdjustmentLinesInput extends CreateDraftAdjustmentLinesInput {}

export interface FindAdjustmentWithLinesInput {
  readonly tenantId: string;
  readonly adjustmentId: string;
}

export interface LockAdjustmentWithLinesForPostingInput extends FindAdjustmentWithLinesInput {}

export interface InsertStatusEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly adjustmentId: string;
  readonly fromStatus: InventoryAdjustmentStatus | null;
  readonly toStatus: InventoryAdjustmentStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface ListStatusEventsInput {
  readonly tenantId: string;
  readonly adjustmentId: string;
}

export interface ListAdjustmentsInput {
  readonly tenantId: string;
  readonly branchId?: string | null;
  readonly status?: InventoryAdjustmentStatus | null;
  readonly fromDate?: Date | null;
  readonly toDate?: Date | null;
  readonly limit: number;
}

export interface FindLatestAdjustmentNumberForDateInput {
  readonly tenantId: string;
  readonly datePrefix: string;
}

export interface FindTenantAdjustmentApprovalThresholdInput {
  readonly tenantId: string;
}

export interface FifoCostLayerSnapshot {
  readonly remainingQuantity: string;
  readonly activeReservedQuantity: string;
  readonly allocatableQuantity: string;
  readonly unitCost: string;
}

export interface ListFifoCostLayersInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
}

export abstract class InventoryAdjustmentStore {
  abstract createDraftAdjustment(
    input: CreateDraftAdjustmentInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentRecord>;

  abstract createDraftAdjustmentLines(
    input: CreateDraftAdjustmentLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryAdjustmentLineRecord[]>;

  abstract updateDraftAdjustment(
    input: UpdateDraftAdjustmentInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentRecord | null>;

  abstract replaceDraftAdjustmentLines(
    input: ReplaceDraftAdjustmentLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryAdjustmentLineRecord[]>;

  abstract findAdjustmentWithLines(
    input: FindAdjustmentWithLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentWithLinesRecord | null>;

  abstract lockAdjustmentWithLinesForPosting(
    input: LockAdjustmentWithLinesForPostingInput,
    client: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentWithLinesRecord | null>;

  abstract insertStatusEvent(
    input: InsertStatusEventInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryAdjustmentStatusEventRecord>;

  abstract listStatusEvents(
    input: ListStatusEventsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryAdjustmentStatusEventRecord[]>;

  abstract listAdjustments(
    input: ListAdjustmentsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryAdjustmentListRecord[]>;

  abstract findLatestAdjustmentNumberForDate(
    input: FindLatestAdjustmentNumberForDateInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract findTenantAdjustmentApprovalThreshold(
    input: FindTenantAdjustmentApprovalThresholdInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract listFifoCostLayers(
    input: ListFifoCostLayersInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoCostLayerSnapshot[]>;
}
