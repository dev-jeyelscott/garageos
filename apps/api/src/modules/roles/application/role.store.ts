import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export const ROLE_TYPES = {
  SHOP_OWNER: 'shop_owner',
  MANAGER: 'manager',
  SERVICE_ADVISOR: 'service_advisor',
  MECHANIC: 'mechanic',
  CASHIER: 'cashier',
  INVENTORY_CLERK: 'inventory_clerk',
  CUSTOM: 'custom',
} as const;

export type RoleType = (typeof ROLE_TYPES)[keyof typeof ROLE_TYPES];

export type RoleStatus = 'active' | 'inactive';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface PermissionRecord {
  readonly id: string;
  readonly code: string;
  readonly category: string;
  readonly description: string | null;
}

export interface RoleRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly roleType: RoleType;
  readonly isSeededTemplate: boolean;
  readonly status: RoleStatus;
  readonly lockVersion: number;
  readonly permissionCodes: readonly string[];
  readonly assignedUserCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRoleInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly roleType: RoleType;
  readonly isSeededTemplate: boolean;
  readonly createdAt: Date;
}

export interface ReplaceRolePermissionsInput {
  readonly tenantId: string;
  readonly roleId: string;
  readonly permissionIds: readonly string[];
  readonly createdAt: Date;
}

export interface UpdateRoleInput {
  readonly tenantId: string;
  readonly roleId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface DeactivateRoleInput {
  readonly tenantId: string;
  readonly roleId: string;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface SoleRoleDependencyInput {
  readonly tenantId: string;
  readonly roleId: string;
}

export abstract class RoleStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listRoles(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly RoleRecord[]>;

  abstract findRoleById(
    tenantId: string,
    roleId: string,
    client?: DatabaseQueryClient,
  ): Promise<RoleRecord | null>;

  abstract listTenantAssignablePermissions(
    client?: DatabaseQueryClient,
  ): Promise<readonly PermissionRecord[]>;

  abstract findTenantAssignablePermissionsByCodes(
    permissionCodes: readonly string[],
    client?: DatabaseQueryClient,
  ): Promise<readonly PermissionRecord[]>;

  abstract createRole(input: CreateRoleInput, client: DatabaseQueryClient): Promise<RoleRecord>;

  abstract replaceRolePermissions(
    input: ReplaceRolePermissionsInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract updateRole(
    input: UpdateRoleInput,
    client: DatabaseQueryClient,
  ): Promise<RoleRecord | null>;

  abstract deactivateRole(
    input: DeactivateRoleInput,
    client: DatabaseQueryClient,
  ): Promise<RoleRecord | null>;

  abstract countActiveUsersDependingSolelyOnRole(
    input: SoleRoleDependencyInput,
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract countActiveAssignedUsers(
    input: SoleRoleDependencyInput,
    client?: DatabaseQueryClient,
  ): Promise<number>;
}
