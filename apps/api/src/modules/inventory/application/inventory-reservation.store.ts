import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export const INVENTORY_RESERVATION_STATUSES = {
  ACTIVE: 'active',
  RELEASED: 'released',
  CONSUMED: 'consumed',
  CANCELLED: 'cancelled',
} as const;

export const INVENTORY_RESERVATION_STATUS_VALUES = Object.values(INVENTORY_RESERVATION_STATUSES);

export type InventoryReservationStatus =
  (typeof INVENTORY_RESERVATION_STATUSES)[keyof typeof INVENTORY_RESERVATION_STATUSES];

export interface CreateInventoryReservationInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly requestedQuantity: string;
  readonly reservedQuantity: string;
  readonly status: InventoryReservationStatus;
  readonly reservedAt: Date;
  readonly releasedAt: Date | null;
  readonly consumedAt: Date | null;
}

export interface LockInventoryReservationInput {
  readonly tenantId: string;
  readonly reservationId: string;
}

export interface ReleaseInventoryReservationInput extends LockInventoryReservationInput {
  readonly releasedAt: Date;
}

export interface InventoryReservationRecord extends CreateInventoryReservationInput {}

export abstract class InventoryReservationStore {
  abstract createReservation(
    input: CreateInventoryReservationInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryReservationRecord>;

  abstract lockActiveReservationForUpdate(
    input: LockInventoryReservationInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryReservationRecord | null>;

  abstract markReservationReleased(
    input: ReleaseInventoryReservationInput,
    client?: DatabaseQueryClient,
  ): Promise<InventoryReservationRecord | null>;
}
