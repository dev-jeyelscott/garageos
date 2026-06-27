import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateRoleRequest,
  DeactivateRoleRequest,
  UpdateRoleRequest,
} from '../api/role.schemas';
import { ROLE_TYPES, RoleStore, type PermissionRecord, type RoleRecord } from './role.store';

export interface PermissionResponse {
  readonly code: string;
  readonly category: string;
  readonly description: string | null;
}

export interface PermissionListResponse {
  readonly permissions: readonly PermissionResponse[];
}

export interface RoleResponse {
  readonly id: string;
  readonly name: string;
  readonly role_type: string;
  readonly is_seeded_template: boolean;
  readonly status: 'active' | 'inactive';
  readonly permission_codes: readonly string[];
  readonly assigned_user_count: number;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RoleListResponse {
  readonly roles: readonly RoleResponse[];
}

export interface RoleMutationResponse extends RoleResponse {
  readonly affected_user_count: number;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class RoleService {
  constructor(
    @Inject(RoleStore)
    private readonly roleStore: RoleStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listRoles(session: TenantContextAuthenticatedSession): Promise<RoleListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'roles.read');

    const roles = await this.roleStore.listRoles(context.tenantId);

    return {
      roles: roles.map(toRoleResponse),
    };
  }

  async getRole(roleId: string, session: TenantContextAuthenticatedSession): Promise<RoleResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'roles.read');

    const role = await this.roleStore.findRoleById(context.tenantId, roleId.trim());

    if (role === null) {
      throw GarageOsApiException.resourceNotFound('Role was not found.');
    }

    return toRoleResponse(role);
  }

  async listPermissions(
    session: TenantContextAuthenticatedSession,
  ): Promise<PermissionListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'permissions.read');

    const permissions = await this.roleStore.listTenantAssignablePermissions();

    return {
      permissions: permissions.map(toPermissionResponse),
    };
  }

  async createRole(
    request: CreateRoleRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<RoleMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'roles.create');

    const permissionCodes = normalizePermissionCodes(request.permission_codes);
    assertNoPlatformPermissions(permissionCodes);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const permissions = await this.resolveAssignablePermissions(permissionCodes, transaction);
      const now = new Date();

      const created = await translateDuplicateRoleName(async () =>
        this.roleStore.createRole(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            name: request.name.trim(),
            normalizedName: normalizeName(request.name),
            roleType: ROLE_TYPES.CUSTOM,
            isSeededTemplate: false,
            createdAt: now,
          },
          transaction,
        ),
      );

      await this.roleStore.replaceRolePermissions(
        {
          tenantId: context.tenantId,
          roleId: created.id,
          permissionIds: permissions.map((permission) => permission.id),
          createdAt: now,
        },
        transaction,
      );

      const hydrated =
        (await this.roleStore.findRoleById(context.tenantId, created.id, transaction)) ?? created;

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'roles.created',
        entityType: 'role',
        entityId: hydrated.id,
        afterJson: toRoleResponse(hydrated),
        reason: 'role_created',
        client: transaction,
      });

      return toRoleMutationResponse(hydrated);
    });
  }

  async updateRole(
    roleId: string,
    request: UpdateRoleRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<RoleMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'roles.update');

    const requestedPermissionCodes =
      request.permission_codes === undefined
        ? null
        : normalizePermissionCodes(request.permission_codes);

    if (requestedPermissionCodes !== null) {
      assertNoPlatformPermissions(requestedPermissionCodes);
    }

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.roleStore.findRoleById(
        context.tenantId,
        roleId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Role was not found.');
      }

      assertMutableRole(existing);

      const permissions =
        requestedPermissionCodes === null
          ? null
          : await this.resolveAssignablePermissions(requestedPermissionCodes, transaction);

      const nextName = request.name?.trim() ?? existing.name;
      const updated = await translateDuplicateRoleName(async () =>
        this.roleStore.updateRole(
          {
            tenantId: context.tenantId,
            roleId: existing.id,
            name: nextName,
            normalizedName: normalizeName(nextName),
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            updatedAt: new Date(),
          },
          transaction,
        ),
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      if (permissions !== null) {
        await this.roleStore.replaceRolePermissions(
          {
            tenantId: context.tenantId,
            roleId: existing.id,
            permissionIds: permissions.map((permission) => permission.id),
            createdAt: new Date(),
          },
          transaction,
        );
      }

      const hydrated =
        (await this.roleStore.findRoleById(context.tenantId, existing.id, transaction)) ?? updated;

      const permissionChanged =
        requestedPermissionCodes !== null &&
        !samePermissionCodes(existing.permissionCodes, requestedPermissionCodes);

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: permissionChanged ? 'roles.permissions_updated' : 'roles.updated',
        entityType: 'role',
        entityId: hydrated.id,
        beforeJson: toRoleResponse(existing),
        afterJson: toRoleResponse(hydrated),
        metadataJson: {
          previous_permission_codes: existing.permissionCodes,
          next_permission_codes: hydrated.permissionCodes,
          affected_user_count: hydrated.assignedUserCount,
        },
        reason:
          normalizeNullableText(request.change_reason) ??
          (permissionChanged ? 'role_permissions_updated' : 'role_updated'),
        client: transaction,
      });

      return toRoleMutationResponse(hydrated);
    });
  }

  async deactivateRole(
    roleId: string,
    request: DeactivateRoleRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<RoleMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'roles.deactivate');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.roleStore.findRoleById(
        context.tenantId,
        roleId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Role was not found.');
      }

      assertDeactivatableRole(existing);

      const soleDependencyCount = await this.roleStore.countActiveUsersDependingSolelyOnRole(
        {
          tenantId: context.tenantId,
          roleId: existing.id,
        },
        transaction,
      );

      if (soleDependencyCount > 0) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'role_id',
            code: 'role_deactivation_blocked_sole_role_dependency',
            message: 'Role cannot be deactivated while active users depend solely on it.',
          },
        ]);
      }

      const changed = await this.roleStore.deactivateRole(
        {
          tenantId: context.tenantId,
          roleId: existing.id,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedAt: new Date(),
        },
        transaction,
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'roles.deactivated',
        entityType: 'role',
        entityId: changed.id,
        beforeJson: toRoleResponse(existing),
        afterJson: toRoleResponse(changed),
        metadataJson: {
          affected_user_count: existing.assignedUserCount,
        },
        reason: normalizeNullableText(request.reason) ?? 'role_deactivated',
        client: transaction,
      });

      return toRoleMutationResponse(changed);
    });
  }

  private isShopOwner(context: ResolvedTenantContext): Promise<boolean> {
    return this.roleStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });
  }

  private async resolveAssignablePermissions(
    permissionCodes: readonly string[],
    transaction: Parameters<RoleStore['findTenantAssignablePermissionsByCodes']>[1],
  ): Promise<readonly PermissionRecord[]> {
    const permissions = await this.roleStore.findTenantAssignablePermissionsByCodes(
      permissionCodes,
      transaction,
    );
    const foundCodes = new Set(permissions.map((permission) => permission.code));
    const missingCodes = permissionCodes.filter(
      (permissionCode) => !foundCodes.has(permissionCode),
    );

    if (missingCodes.length > 0) {
      throw GarageOsApiException.validationFailed(
        missingCodes.map((permissionCode) => ({
          field: 'permission_codes',
          code: 'unknown_or_non_assignable_permission',
          message: `Permission is unknown or cannot be assigned to tenant roles: ${permissionCode}`,
        })),
      );
    }

    return permissions;
  }
}

function toRoleResponse(role: RoleRecord): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    role_type: role.roleType,
    is_seeded_template: role.isSeededTemplate,
    status: role.status,
    permission_codes: role.permissionCodes,
    assigned_user_count: role.assignedUserCount,
    lock_version: role.lockVersion,
    created_at: role.createdAt.toISOString(),
    updated_at: role.updatedAt.toISOString(),
  };
}

function toRoleMutationResponse(role: RoleRecord): RoleMutationResponse {
  return {
    ...toRoleResponse(role),
    affected_user_count: role.assignedUserCount,
  };
}

function toPermissionResponse(permission: PermissionRecord): PermissionResponse {
  return {
    code: permission.code,
    category: permission.category,
    description: permission.description,
  };
}

function assertPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function assertMutableRole(role: RoleRecord): void {
  if (role.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'role_id',
        code: 'invalid_role_status',
        message: 'Role must be active before it can be updated.',
      },
    ]);
  }

  if (role.roleType === ROLE_TYPES.SHOP_OWNER) {
    throw protectedShopOwnerRoleError();
  }
}

function assertDeactivatableRole(role: RoleRecord): void {
  if (role.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'role_id',
        code: 'invalid_role_status',
        message: 'Role must be active before it can be deactivated.',
      },
    ]);
  }

  if (role.roleType === ROLE_TYPES.SHOP_OWNER) {
    throw protectedShopOwnerRoleError();
  }
}

function protectedShopOwnerRoleError(): GarageOsApiException {
  return GarageOsApiException.validationFailed([
    {
      field: 'role_id',
      code: 'protected_shop_owner_role',
      message: 'Shop Owner role capabilities are protected and cannot be modified here.',
    },
  ]);
}

function assertNoPlatformPermissions(permissionCodes: readonly string[]): void {
  const platformPermissionCodes = permissionCodes.filter((permissionCode) =>
    permissionCode.startsWith('platform.'),
  );

  if (platformPermissionCodes.length > 0) {
    throw GarageOsApiException.validationFailed(
      platformPermissionCodes.map((permissionCode) => ({
        field: 'permission_codes',
        code: 'platform_permission_not_assignable',
        message: `Platform permission cannot be assigned to tenant roles: ${permissionCode}`,
      })),
    );
  }
}

function normalizePermissionCodes(permissionCodes: readonly string[]): readonly string[] {
  return [...new Set(permissionCodes.map((permissionCode) => permissionCode.trim()))].sort();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function samePermissionCodes(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = normalizePermissionCodes(left);
  const normalizedRight = normalizePermissionCodes(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((permissionCode, index) => permissionCode === normalizedRight[index])
  );
}

async function translateDuplicateRoleName<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveRoleNameUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active role with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isActiveRoleNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint === 'ux_roles_active_name'
  );
}
