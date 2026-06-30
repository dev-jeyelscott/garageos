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

export interface UpdateFifoReservationAllocationQuantityInput {
  readonly tenantId: string;
  readonly allocationId: string;
  readonly reservedQuantity: string;
}

export interface ReleaseFifoReservationAllocationInput {
  readonly tenantId: string;
  readonly allocationId: string;
  readonly releasedAt: Date;
}

export interface LockFifoReservationAllocationsInput {
  readonly tenantId: string;
  readonly reservationId: string;
}

export interface ConsumeFifoReservationAllocationsInput {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly allocationIds: readonly string[];
  readonly consumedAt: Date;
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

  abstract lockActiveAllocationsByReservationForUpdate(
    input: LockFifoReservationAllocationsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoReservationAllocationRecord[]>;

  updateActiveAllocationQuantity(
    _input: UpdateFifoReservationAllocationQuantityInput,
    _client?: DatabaseQueryClient,
  ): Promise<FifoReservationAllocationRecord | null> {
    throw new Error(
      'FifoReservationAllocationStore.updateActiveAllocationQuantity is not implemented.',
    );
  }

  releaseActiveAllocation(
    _input: ReleaseFifoReservationAllocationInput,
    _client?: DatabaseQueryClient,
  ): Promise<FifoReservationAllocationRecord | null> {
    throw new Error('FifoReservationAllocationStore.releaseActiveAllocation is not implemented.');
  }

  abstract markActiveAllocationsConsumedByReservation(
    input: ConsumeFifoReservationAllocationsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly FifoReservationAllocationRecord[]>;
}
