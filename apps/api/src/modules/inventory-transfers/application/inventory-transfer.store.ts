import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  InventoryTransferLineRecord,
  InventoryTransferRecord,
  InventoryTransferStatus,
  InventoryTransferStatusEventRecord,
} from './inventory-transfer.records';

export interface CreateDraftTransferInput {
  readonly id: string;
  readonly tenantId: string;
  readonly transferNumber: string;
  readonly sourceBranchId: string;
  readonly destinationBranchId: string;
  readonly remarks: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface CreateDraftTransferLinesInput {
  readonly tenantId: string;
  readonly transferId: string;
  readonly lines: readonly CreateDraftTransferLineInput[];
}

export interface CreateDraftTransferLineInput {
  readonly id: string;
  readonly productId: string;
  readonly requestedQuantity: string;
}

export interface InsertStatusEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly transferId: string;
  readonly fromStatus: InventoryTransferStatus | null;
  readonly toStatus: InventoryTransferStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface FindLatestTransferNumberForDateInput {
  readonly tenantId: string;
  readonly datePrefix: string;
}

export abstract class InventoryTransferStore {
  abstract createDraftTransfer(
    input: CreateDraftTransferInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryTransferRecord>;

  abstract createDraftTransferLines(
    input: CreateDraftTransferLinesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryTransferLineRecord[]>;

  abstract insertStatusEvent(
    input: InsertStatusEventInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryTransferStatusEventRecord>;

  abstract findLatestTransferNumberForDate(
    input: FindLatestTransferNumberForDateInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;
}
