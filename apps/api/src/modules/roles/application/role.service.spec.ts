import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import { AuditService } from '../../../shared/audit/audit.service';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import {
  type CreateRoleInput,
  type DeactivateRoleInput,
  type PermissionRecord,
  type ReplaceRolePermissionsInput,
  ROLE_TYPES,
  type RoleRecord,
  RoleStore,
  type SoleRoleDependencyInput,
  type UpdateRoleInput,
} from './role.store';
import { RoleService } from './role.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';
const PERMISSION_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('RoleService', () => {
  it('lists tenant-scoped roles only with roles.read permission', async () => {
    const { service, store } = createService();
    store.roles = [createRoleRecord()];

    const response = await service.listRoles(createTenantSession(['roles.read']));

    expect(store.listTenantIds).toEqual([TENANT_ID]);
    expect(response.roles).toHaveLength(1);
    expect(response.roles[0]).toMatchObject({
      id: ROLE_ID,
      name: 'Service Advisor',
      status: 'active',
      permission_codes: ['customers.read'],
      lock_version: 0,
    });
  });

  it('requires roles.read permission for role detail', async () => {
    const { service } = createService();

    await expect(service.getRole(ROLE_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'roles.read' }],
    });
  });

  it('uses session tenant scope when reading a role detail', async () => {
    const { service, store } = createService();
    store.roleById = null;

    await expect(
      service.getRole(ROLE_ID, createTenantSession(['roles.read'], { tenantId: OTHER_TENANT_ID })),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      roleId: ROLE_ID,
    });
  });

  it('lists only tenant-assignable permissions', async () => {
    const { service, store } = createService();
    store.permissions = [createPermissionRecord('roles.read')];

    const response = await service.listPermissions(createTenantSession(['permissions.read']));

    expect(response.permissions).toEqual([
      {
        code: 'roles.read',
        category: 'roles_permissions',
        description: 'roles.read',
      },
    ]);
  });

  it('creates a custom role with tenant permissions and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.assignablePermissions = [createPermissionRecord('roles.read')];
    store.createdRole = createRoleRecord({
      name: 'Front Desk',
      normalizedName: 'front desk',
      roleType: ROLE_TYPES.CUSTOM,
      permissionCodes: ['roles.read'],
    });
    store.findRoleQueue = [store.createdRole];

    const response = await service.createRole(
      {
        name: 'Front Desk',
        permission_codes: ['roles.read'],
      },
      createTenantSession(['roles.create']),
    );

    expect(store.createdInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      name: 'Front Desk',
      normalizedName: 'front desk',
      roleType: ROLE_TYPES.CUSTOM,
      isSeededTemplate: false,
    });
    expect(store.replacedPermissionInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      permissionIds: [PERMISSION_ID],
    });
    expect(response).toMatchObject({
      name: 'Front Desk',
      role_type: ROLE_TYPES.CUSTOM,
      permission_codes: ['roles.read'],
      affected_user_count: 0,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'roles.created',
        entityType: 'role',
      }),
    );
  });

  it('blocks assigning platform permissions to tenant roles', async () => {
    const { service } = createService();

    await expect(
      service.createRole(
        {
          name: 'Bad Role',
          permission_codes: ['platform.tenants.read'],
        },
        createTenantSession(['roles.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'platform_permission_not_assignable' })],
    });
  });

  it('blocks role updates for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.updateRole(
        ROLE_ID,
        {
          name: 'Updated Role',
          lock_version: 0,
        },
        createTenantSession(['roles.update'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('protects the Shop Owner role from update', async () => {
    const { service, store } = createService();
    store.roleById = createRoleRecord({
      roleType: ROLE_TYPES.SHOP_OWNER,
      name: 'Shop Owner',
      normalizedName: 'shop owner',
    });

    await expect(
      service.updateRole(
        ROLE_ID,
        {
          name: 'Owner Lite',
          lock_version: 0,
        },
        createTenantSession(['roles.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'protected_shop_owner_role' })],
    });
  });

  it('updates role permissions with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    const existing = createRoleRecord({
      permissionCodes: ['customers.read'],
    });
    const updated = createRoleRecord({
      name: 'Service Advisor',
      permissionCodes: ['customers.read', 'customers.create'],
      lockVersion: 1,
      assignedUserCount: 2,
    });

    store.roleById = existing;
    store.findRoleQueue = [existing, updated];
    store.updatedRole = createRoleRecord({ lockVersion: 1 });
    store.assignablePermissions = [
      createPermissionRecord('customers.read'),
      createPermissionRecord('customers.create', {
        id: '66666666-6666-4666-8666-666666666666',
        category: 'customers',
      }),
    ];

    const response = await service.updateRole(
      ROLE_ID,
      {
        permission_codes: ['customers.create', 'customers.read'],
        change_reason: 'Expand intake access.',
        lock_version: 0,
      },
      createTenantSession(['roles.update']),
    );

    expect(store.updatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      roleId: ROLE_ID,
      expectedLockVersion: 0,
    });
    expect(store.replacedPermissionInputs[0]?.permissionIds).toEqual([
      PERMISSION_ID,
      '66666666-6666-4666-8666-666666666666',
    ]);
    expect(response).toMatchObject({
      permission_codes: ['customers.read', 'customers.create'],
      affected_user_count: 2,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'roles.permissions_updated',
        reason: 'Expand intake access.',
      }),
    );
  });

  it('returns version_conflict when role lock version is stale', async () => {
    const { service, store } = createService();
    store.roleById = createRoleRecord();
    store.updatedRole = null;

    await expect(
      service.updateRole(
        ROLE_ID,
        {
          name: 'Updated Role',
          lock_version: 0,
        },
        createTenantSession(['roles.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('blocks role deactivation when active users depend solely on that role', async () => {
    const { service, store } = createService();
    store.roleById = createRoleRecord();
    store.soleDependencyCount = 1;

    await expect(
      service.deactivateRole(
        ROLE_ID,
        {
          lock_version: 0,
        },
        createTenantSession(['roles.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          code: 'role_deactivation_blocked_sole_role_dependency',
        }),
      ],
    });
  });

  it('deactivates a role with optimistic locking and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.roleById = createRoleRecord({ assignedUserCount: 0 });
    store.deactivatedRole = createRoleRecord({
      status: 'inactive',
      lockVersion: 1,
    });

    const response = await service.deactivateRole(
      ROLE_ID,
      {
        lock_version: 0,
        reason: 'No longer used.',
      },
      createTenantSession(['roles.deactivate']),
    );

    expect(store.deactivatedInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      roleId: ROLE_ID,
      expectedLockVersion: 0,
    });
    expect(response).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'roles.deactivated',
        reason: 'No longer used.',
      }),
    );
  });
});

function createService(): {
  readonly service: RoleService;
  readonly store: FakeRoleStore;
  readonly auditService: AuditService;
} {
  const store = new FakeRoleStore();
  const auditService = {
    record: vi.fn(
      async (input: unknown): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: 'tenant_user',
        supportAccessSessionId: null,
        action:
          typeof input === 'object' && input !== null && 'action' in input
            ? String(input.action)
            : 'test.audit',
        entityType:
          typeof input === 'object' && input !== null && 'entityType' in input
            ? String(input.entityType)
            : 'test',
        entityId: null,
        branchId: null,
        beforeJson: null,
        afterJson: null,
        metadataJson: null,
        reason: null,
        ipAddress: null,
        userAgent: null,
        retentionClass: 'standard_3_year',
        createdAt: NOW,
      }),
    ),
  } as unknown as AuditService;

  return {
    service: new RoleService(store, new FakeTransactionRunner(), auditService),
    store,
    auditService,
  };
}

function createTenantSession(
  permissions: readonly string[],
  overrides: {
    readonly tenantId?: string;
    readonly tenantStatus?: TenantStatus;
  } = {},
): TenantContextAuthenticatedSession {
  const tenantId = overrides.tenantId ?? TENANT_ID;

  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: overrides.tenantStatus ?? 'active',
    },
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}

function createPermissionRecord(
  code: string,
  overrides: Partial<PermissionRecord> = {},
): PermissionRecord {
  return {
    id: overrides.id ?? PERMISSION_ID,
    code,
    category: overrides.category ?? 'roles_permissions',
    description: overrides.description ?? code,
  };
}

function createRoleRecord(overrides: Partial<RoleRecord> = {}): RoleRecord {
  return {
    id: overrides.id ?? ROLE_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    name: overrides.name ?? 'Service Advisor',
    normalizedName: overrides.normalizedName ?? 'service advisor',
    roleType: overrides.roleType ?? ROLE_TYPES.SERVICE_ADVISOR,
    isSeededTemplate: overrides.isSeededTemplate ?? true,
    status: overrides.status ?? 'active',
    lockVersion: overrides.lockVersion ?? 0,
    permissionCodes: overrides.permissionCodes ?? ['customers.read'],
    assignedUserCount: overrides.assignedUserCount ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

const FAKE_DATABASE_CLIENT: DatabaseQueryClient = {
  async query<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseQueryResult<Row>> {
    return {
      rows: [],
      rowCount: 0,
    };
  },
};

class FakeTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work(FAKE_DATABASE_CLIENT);
  }
}

class FakeRoleStore extends RoleStore {
  isOwner = false;
  roles: RoleRecord[] = [];
  roleById: RoleRecord | null = null;
  findRoleQueue: RoleRecord[] = [];
  permissions: PermissionRecord[] = [createPermissionRecord('roles.read')];
  assignablePermissions: PermissionRecord[] = [];
  createdRole: RoleRecord | null = createRoleRecord({ roleType: ROLE_TYPES.CUSTOM });
  updatedRole: RoleRecord | null = createRoleRecord({ lockVersion: 1 });
  deactivatedRole: RoleRecord | null = createRoleRecord({ status: 'inactive', lockVersion: 1 });
  soleDependencyCount = 0;
  activeAssignedUserCount = 0;

  readonly listTenantIds: string[] = [];
  readonly findInputs: Array<{ tenantId: string; roleId: string }> = [];
  readonly createdInputs: CreateRoleInput[] = [];
  readonly replacedPermissionInputs: ReplaceRolePermissionsInput[] = [];
  readonly updatedInputs: UpdateRoleInput[] = [];
  readonly deactivatedInputs: DeactivateRoleInput[] = [];
  readonly soleDependencyInputs: SoleRoleDependencyInput[] = [];

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async listRoles(tenantId: string): Promise<readonly RoleRecord[]> {
    this.listTenantIds.push(tenantId);

    return this.roles;
  }

  async findRoleById(tenantId: string, roleId: string): Promise<RoleRecord | null> {
    this.findInputs.push({ tenantId, roleId });

    const queuedRole = this.findRoleQueue.shift();

    if (queuedRole !== undefined) {
      return queuedRole;
    }

    return this.roleById;
  }

  async listTenantAssignablePermissions(): Promise<readonly PermissionRecord[]> {
    return this.permissions;
  }

  async findTenantAssignablePermissionsByCodes(
    permissionCodes: readonly string[],
  ): Promise<readonly PermissionRecord[]> {
    const source =
      this.assignablePermissions.length > 0 ? this.assignablePermissions : this.permissions;

    return source.filter((permission) => permissionCodes.includes(permission.code));
  }

  async createRole(input: CreateRoleInput): Promise<RoleRecord> {
    this.createdInputs.push(input);

    return (
      this.createdRole ??
      createRoleRecord({
        id: input.id,
        tenantId: input.tenantId,
        name: input.name,
        normalizedName: input.normalizedName,
        roleType: input.roleType,
        isSeededTemplate: input.isSeededTemplate,
      })
    );
  }

  async replaceRolePermissions(input: ReplaceRolePermissionsInput): Promise<void> {
    this.replacedPermissionInputs.push(input);
  }

  async updateRole(input: UpdateRoleInput): Promise<RoleRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedRole;
  }

  async deactivateRole(input: DeactivateRoleInput): Promise<RoleRecord | null> {
    this.deactivatedInputs.push(input);

    return this.deactivatedRole;
  }

  async countActiveUsersDependingSolelyOnRole(input: SoleRoleDependencyInput): Promise<number> {
    this.soleDependencyInputs.push(input);

    return this.soleDependencyCount;
  }

  async countActiveAssignedUsers(): Promise<number> {
    return this.activeAssignedUserCount;
  }
}
