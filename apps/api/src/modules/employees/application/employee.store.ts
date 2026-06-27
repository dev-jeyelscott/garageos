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
  readonly roleIds: readonly string[];
  readonly branchIds: readonly string[];
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

export interface ActiveRoleRecord {
  readonly id: string;
  readonly roleType: string;
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

export interface ReplaceEmployeeRolesInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
  readonly expectedLockVersion: number;
  readonly changedAt: Date;
}

export interface ReplaceEmployeeBranchesInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly userId: string;
  readonly branchIds: readonly string[];
  readonly tenantWideBranchAccess: boolean;
  readonly assignedByUserId: string;
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

export interface ExpirePendingInvitationsInput {
  readonly tenantId: string;
  readonly expiredAt: Date;
}

export interface RevokeInvitationInput {
  readonly tenantId: string;
  readonly invitationId: string;
  readonly revokedAt: Date;
}

export abstract class EmployeeStore {
  abstract isActiveShopOwner(
    input: ShopOwnerCheckInput,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

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

  abstract findActiveRolesByIds(
    tenantId: string,
    roleIds: readonly string[],
    client?: DatabaseQueryClient,
  ): Promise<readonly ActiveRoleRecord[]>;

  abstract findActiveBranchesByIds(
    tenantId: string,
    branchIds: readonly string[],
    client?: DatabaseQueryClient,
  ): Promise<readonly string[]>;

  abstract replaceEmployeeRoles(
    input: ReplaceEmployeeRolesInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeRecord | null>;

  abstract replaceEmployeeBranches(
    input: ReplaceEmployeeBranchesInput,
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

  abstract listInvitations(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly EmployeeInvitationRecord[]>;

  abstract findInvitationById(
    tenantId: string,
    invitationId: string,
    client?: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord | null>;

  abstract expirePendingInvitations(
    input: ExpirePendingInvitationsInput,
    client: DatabaseQueryClient,
  ): Promise<readonly EmployeeInvitationRecord[]>;

  abstract createInvitation(
    input: CreateInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord>;

  abstract revokeInvitation(
    input: RevokeInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<EmployeeInvitationRecord | null>;
}
