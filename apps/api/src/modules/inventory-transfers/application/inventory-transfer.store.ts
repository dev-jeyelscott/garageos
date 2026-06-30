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

export interface UpdateTransferLineReservationInput {
  readonly tenantId: string;
  readonly lineId: string;
  readonly reservedQuantity: string;
  readonly reservationId: string;
}

export interface UpdateTransferStatusInput {
  readonly tenantId: string;
  readonly transferId: string;
  readonly expectedStatus: InventoryTransferStatus;
  readonly nextStatus: InventoryTransferStatus;
  readonly updatedAt: Date;
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

  abstract lockTransferForUpdate(
    tenantId: string,
    transferId: string,
    client?: DatabaseQueryClient,
  ): Promise<InventoryTransferRecord | null>;

  abstract listTransferLinesForUpdate(
    tenantId: string,
    transferId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryTransferLineRecord[]>;

  abstract updateTransferLineReservation(
    input: UpdateTransferLineReservationInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryTransferLineRecord>;

  abstract updateTransferStatus(
    input: UpdateTransferStatusInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryTransferRecord | null>;

  abstract findLatestTransferNumberForDate(
    input: FindLatestTransferNumberForDateInput,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;
}
