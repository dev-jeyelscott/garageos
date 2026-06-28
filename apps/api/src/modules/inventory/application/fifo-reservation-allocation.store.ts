import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export const FIFO_ALLOCATION_STATUSES = {
  ACTIVE: 'active',
  RELEASED: 'released',
  CONSUMED: 'consumed',
  CANCELLED: 'cancelled',
} as const;

export const FIFO_ALLOCATION_STATUS_VALUES = Object.values(FIFO_ALLOCATION_STATUSES);

export type FifoAllocationStatus =
  (typeof FIFO_ALLOCATION_STATUSES)[keyof typeof FIFO_ALLOCATION_STATUSES];

export interface CreateFifoReservationAllocationInput {
  readonly id: string;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly fifoLayerId: string;
  readonly reservedQuantity: string;
  readonly unitCostSnapshot: string;
  readonly status: FifoAllocationStatus;
  readonly allocatedAt: Date;
  readonly releasedAt: Date | null;
  readonly consumedAt: Date | null;
}

export interface ReleaseFifoReservationAllocationsInput {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly releasedAt: Date;
}

export interface FifoReservationAllocationRecord extends CreateFifoReservationAllocationInput {}

export abstract class FifoReservationAllocationStore {
  abstract createAllocations(
    inputs: readonly CreateFifoReservationAllocationInput[],
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoReservationAllocationRecord[]>;

  abstract releaseActiveAllocationsByReservation(
    input: ReleaseFifoReservationAllocationsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoReservationAllocationRecord[]>;
}
