import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type MotorcycleStatus = 'active' | 'soft_deleted';

export type MotorcycleIdentifierType = 'plate_number' | 'engine_number' | 'chassis_number';

export type MotorcycleDuplicateWarningType =
  | 'similar_plate_number'
  | 'similar_engine_number'
  | 'similar_chassis_number'
  | 'similar_model';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ActiveCustomerRecord {
  readonly id: string;
  readonly name: string;
}

export interface MotorcycleRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plateNumber: string | null;
  readonly normalizedPlateNumber: string | null;
  readonly engineNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly chassisNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly latestMileage: number;
  readonly status: MotorcycleStatus;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
}

export interface MotorcycleIdentifierConflictRecord {
  readonly type: MotorcycleIdentifierType;
  readonly motorcycleId: string;
  readonly brand: string;
  readonly model: string;
  readonly plateNumber: string | null;
  readonly engineNumber: string | null;
  readonly chassisNumber: string | null;
}

export interface MotorcycleDuplicateWarningRecord {
  readonly type: MotorcycleDuplicateWarningType;
  readonly motorcycleId: string;
  readonly brand: string;
  readonly model: string;
  readonly plateNumber: string | null;
  readonly engineNumber: string | null;
  readonly chassisNumber: string | null;
}

export interface ListMotorcyclesInput {
  readonly tenantId: string;
  readonly customerId: string | null;
  readonly normalizedSearch: string | null;
  readonly normalizedIdentifierSearch: string | null;
  readonly limit: number;
}

export interface FindMotorcycleIdentifierConflictsInput {
  readonly tenantId: string;
  readonly normalizedPlateNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly excludeMotorcycleId: string | null;
}

export interface FindMotorcycleDuplicateWarningsInput {
  readonly tenantId: string;
  readonly normalizedPlateNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly normalizedBrandModel: string;
  readonly excludeMotorcycleId: string | null;
}

export interface CreateMotorcycleInput {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plateNumber: string | null;
  readonly normalizedPlateNumber: string | null;
  readonly engineNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly chassisNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly latestMileage: number;
  readonly createdAt: Date;
}

export interface UpdateMotorcycleInput {
  readonly tenantId: string;
  readonly motorcycleId: string;
  readonly customerId: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plateNumber: string | null;
  readonly normalizedPlateNumber: string | null;
  readonly engineNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly chassisNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly latestMileage: number;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface CreateMotorcycleMileageEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly motorcycleId: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly previousMileage: number | null;
  readonly newMileage: number;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export abstract class MotorcycleStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract findActiveCustomerById(
    tenantId: string,
    customerId: string,
    client?: DatabaseQueryClient,
  ): Promise<ActiveCustomerRecord | null>;

  abstract listMotorcycles(
    input: ListMotorcyclesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly MotorcycleRecord[]>;

  abstract findMotorcycleById(
    tenantId: string,
    motorcycleId: string,
    client?: DatabaseQueryClient,
  ): Promise<MotorcycleRecord | null>;

  abstract createMotorcycle(
    input: CreateMotorcycleInput,
    client: DatabaseQueryClient,
  ): Promise<MotorcycleRecord>;

  abstract updateMotorcycle(
    input: UpdateMotorcycleInput,
    client: DatabaseQueryClient,
  ): Promise<MotorcycleRecord | null>;

  abstract createMotorcycleMileageEvent(
    input: CreateMotorcycleMileageEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findIdentifierConflicts(
    input: FindMotorcycleIdentifierConflictsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly MotorcycleIdentifierConflictRecord[]>;

  abstract findDuplicateWarnings(
    input: FindMotorcycleDuplicateWarningsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly MotorcycleDuplicateWarningRecord[]>;
}
