import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type EmployeeStatus = 'active' | 'inactive';
export type EmployeeInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface EmployeeRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly mobileNumber: string | null;
  readonly status: EmployeeStatus;
  readonly userStatus: EmployeeStatus;
  readonly tenantWideBranchAccess: boolean;
  readonly lockVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
}

export interface EmployeeInvitationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly status: EmployeeInvitationStatus;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export interface CreateEmployeeInput {
  readonly employeeId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly fullName: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly passwordHash: string;
  readonly mobileNumber: string | null;
  readonly createdAt: Date;
}

export interface UpdateEmployeeInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly fullName: string;
  readonly mobileNumber: string | null;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface ChangeEmployeeStatusInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly fromStatus: EmployeeStatus;
  readonly toStatus: EmployeeStatus;
  readonly expectedLockVersion: number;
  readonly changedAt: Date;
}

export interface CreateInvitationInput {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdByUserId: string;
}

export interface CreatePasswordResetTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export abstract class EmployeeStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listEmployees(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly EmployeeRecord[]>;

  abstract findEmployeeById(
    tenantId: string,
    employeeId: string,
    client?: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null>;

  abstract createEmployee(
    input: CreateEmployeeInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord>;

  abstract updateEmployee(
    input: UpdateEmployeeInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null>;

  abstract changeEmployeeStatus(
    input: ChangeEmployeeStatusInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null>;

  abstract revokeRefreshSessionsForUser(
    input: {
      readonly userId: string;
      readonly revokedAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createPasswordResetToken(
    input: CreatePasswordResetTokenInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract countActiveShopOwners(
    input: {
      readonly tenantId: string;
      readonly excludingUserId?: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract countActiveRolesForUser(
    input: {
      readonly tenantId: string;
      readonly userId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract countActiveBranchAssignmentsForUser(
    input: {
      readonly tenantId: string;
      readonly userId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract activeUserExistsByNormalizedEmail(
    normalizedEmail: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract pendingInvitationExists(
    input: {
      readonly tenantId: string;
      readonly normalizedEmail: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract createInvitation(
    input: CreateInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord>;
}
