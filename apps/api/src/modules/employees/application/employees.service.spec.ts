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
import { PasswordHashingService } from '../../auth/application/password-hashing.service';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import {
  type ActiveRoleRecord,
  type ChangeEmployeeStatusInput,
  type CreateEmployeeInput,
  type CreateInvitationInput,
  EmployeeStore,
  type EmployeeInvitationRecord,
  type EmployeeRecord,
  type ReplaceEmployeeBranchesInput,
  type ReplaceEmployeeRolesInput,
  type RevokeInvitationInput,
  type UpdateEmployeeInput,
} from './employee.store';
import { EmployeesService } from './employees.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_USER_ID = '55555555-5555-4555-8555-555555555555';
const INVITATION_ID = '66666666-6666-4666-8666-666666666666';
const ROLE_ID = '77777777-7777-4777-8777-777777777777';
const SHOP_OWNER_ROLE_ID = '88888888-8888-4888-8888-888888888888';
const BRANCH_ID = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('EmployeesService', () => {
  it('lists employees from the authenticated tenant only', async () => {
    const { service, store } = createService();
    store.isOwner = false;
    store.employees = [createEmployeeRecord()];

    const response = await service.listEmployees(createTenantSession(['users.read']));

    expect(store.listTenantIds).toEqual([TENANT_ID]);
    expect(response.employees[0]).toMatchObject({
      id: EMPLOYEE_ID,
      user_id: EMPLOYEE_USER_ID,
      email: 'tech@example.com',
      status: 'active',
    });
  });

  it('requires users.read for employee detail', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord();
    store.isOwner = false;

    await expect(service.getEmployee(EMPLOYEE_ID, createTenantSession([]))).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [{ required_permission: 'users.read' }],
    });
  });

  it('uses session tenant scope for employee detail', async () => {
    const { service, store } = createService();
    store.employeeById = null;

    await expect(
      service.getEmployee(
        EMPLOYEE_ID,
        createTenantSession(['users.read'], { tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.findInputs[0]).toMatchObject({
      tenantId: OTHER_TENANT_ID,
      employeeId: EMPLOYEE_ID,
    });
  });

  it('blocks employee writes for read-only tenants', async () => {
    const { service } = createService();

    await expect(
      service.updateEmployee(
        EMPLOYEE_ID,
        { full_name: 'Updated Tech', lock_version: 0 },
        createTenantSession(['users.update'], { tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
    });
  });

  it('updates employee profile fields with optimistic locking and audit logging', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      store.employeeById = createEmployeeRecord();
      store.updatedEmployee = createEmployeeRecord({
        fullName: 'Updated Tech',
        mobileNumber: '+639991112222',
        lockVersion: 1,
        updatedAt: NOW,
      });

      const response = await service.updateEmployee(
        EMPLOYEE_ID,
        {
          full_name: 'Updated Tech',
          mobile_number: '+639991112222',
          lock_version: 0,
        },
        createTenantSession(['users.update']),
      );

      expect(store.updatedInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        fullName: 'Updated Tech',
        expectedLockVersion: 0,
      });
      expect(response).toMatchObject({
        full_name: 'Updated Tech',
        lock_version: 1,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'employees.updated',
          entityType: 'employee',
          entityId: EMPLOYEE_ID,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns version_conflict when employee update lock version is stale', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord();
    store.updatedEmployee = null;

    await expect(
      service.updateEmployee(
        EMPLOYEE_ID,
        { full_name: 'Updated Tech', lock_version: 0 },
        createTenantSession(['users.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VERSION_CONFLICT,
    });
  });

  it('creates an inactive employee with a password setup token and audit log', async () => {
    const { service, store, auditService } = createService();

    const response = await service.createEmployee(
      {
        full_name: 'New Tech',
        email: 'New.Tech@Example.com',
        mobile_number: '+639171234567',
      },
      createTenantSession(['users.create']),
    );

    expect(store.createdInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      fullName: 'New Tech',
      email: 'New.Tech@Example.com',
      normalizedEmail: 'new.tech@example.com',
    });
    expect(store.passwordResetTokenInputs[0]).toMatchObject({
      userId: response.user_id,
      tokenHash: 'hashed-token',
    });
    expect(response.status).toBe('inactive');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employees.created',
        reason: 'employee_created_with_password_setup',
      }),
    );
  });

  it('blocks duplicate active user email during direct employee creation', async () => {
    const { service, store } = createService();
    store.activeUserEmailExists = true;

    await expect(
      service.createEmployee(
        {
          full_name: 'Duplicate',
          email: 'tech@example.com',
        },
        createTenantSession(['users.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('creates employee invitations that expire after seven days and are audited', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createInvitation(
        { email: 'Invitee@Example.com' },
        createTenantSession(['users.create']),
      );

      expect(store.invitationInputs[0]).toMatchObject({
        tenantId: TENANT_ID,
        email: 'Invitee@Example.com',
        normalizedEmail: 'invitee@example.com',
        createdByUserId: USER_ID,
      });
      expect(store.invitationInputs[0]?.expiresAt.toISOString()).toBe('2026-07-04T00:00:00.000Z');
      expect(response).toMatchObject({
        email: 'Invitee@Example.com',
        status: 'pending',
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'employee_invitations.created',
          entityType: 'employee_invitation',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks duplicate pending invitations', async () => {
    const { service, store } = createService();
    store.pendingInvitationAlreadyExists = true;

    await expect(
      service.createInvitation(
        { email: 'invitee@example.com' },
        createTenantSession(['users.create']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });
  });

  it('deactivates employees, revokes sessions, and writes audit logs', async () => {
    const { service, store, auditService } = createService();
    store.employeeById = createEmployeeRecord();
    store.changedEmployee = createEmployeeRecord({
      status: 'inactive',
      userStatus: 'inactive',
      lockVersion: 1,
      deactivatedAt: NOW,
    });
    store.otherActiveOwnerCount = 1;

    const response = await service.deactivateEmployee(
      EMPLOYEE_ID,
      { lock_version: 0, reason: 'Left company.' },
      createTenantSession(['users.deactivate']),
    );

    expect(response).toMatchObject({
      status: 'inactive',
      lock_version: 1,
    });
    expect(store.changedInputs[0]).toMatchObject({
      fromStatus: 'active',
      toStatus: 'inactive',
      expectedLockVersion: 0,
    });
    expect(store.revokedUserIds).toEqual([EMPLOYEE_USER_ID]);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employees.deactivated',
        reason: 'Left company.',
      }),
    );
  });

  it('blocks deactivating the last active Shop Owner', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord();
    store.employeeIsOwner = true;
    store.otherActiveOwnerCount = 0;

    await expect(
      service.deactivateEmployee(
        EMPLOYEE_ID,
        { lock_version: 0 },
        createTenantSession(['users.deactivate']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'last_active_shop_owner' })],
    });
  });

  it('reactivates employees only after current role and branch checks pass', async () => {
    const { service, store, auditService } = createService();
    store.employeeById = createEmployeeRecord({
      status: 'inactive',
      userStatus: 'inactive',
    });
    store.activeRoleCount = 1;
    store.activeBranchAssignmentCount = 1;
    store.changedEmployee = createEmployeeRecord({
      lockVersion: 1,
      reactivatedAt: NOW,
    });

    const response = await service.reactivateEmployee(
      EMPLOYEE_ID,
      { lock_version: 0, reason: 'Returned.' },
      createTenantSession(['users.update']),
    );

    expect(response).toMatchObject({
      status: 'active',
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employees.reactivated',
        reason: 'Returned.',
      }),
    );
  });

  it('blocks employee reactivation without an active role', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord({
      status: 'inactive',
      userStatus: 'inactive',
    });
    store.activeRoleCount = 0;

    await expect(
      service.reactivateEmployee(
        EMPLOYEE_ID,
        { lock_version: 0 },
        createTenantSession(['users.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'employee_requires_active_role' })],
    });
  });

  it('blocks employee reactivation without branch assignment unless tenant-wide access exists', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord({
      status: 'inactive',
      userStatus: 'inactive',
      tenantWideBranchAccess: false,
    });
    store.activeRoleCount = 1;
    store.activeBranchAssignmentCount = 0;

    await expect(
      service.reactivateEmployee(
        EMPLOYEE_ID,
        { lock_version: 0 },
        createTenantSession(['users.update']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'employee_requires_active_branch_assignment' })],
    });
  });

  it('assigns active roles with users.assign_roles permission and audit logging', async () => {
    const { service, store, auditService } = createService();
    store.employeeById = createEmployeeRecord();
    store.activeRoles = [{ id: ROLE_ID, roleType: 'custom' }];
    store.roleAssignedEmployee = createEmployeeRecord({
      roleIds: [ROLE_ID],
      lockVersion: 1,
    });

    const response = await service.assignRoles(
      EMPLOYEE_ID,
      {
        role_ids: [ROLE_ID],
        lock_version: 0,
        change_reason: 'Promoted.',
      },
      createTenantSession(['users.assign_roles']),
    );

    expect(store.roleAssignmentInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      userId: EMPLOYEE_USER_ID,
      roleIds: [ROLE_ID],
      expectedLockVersion: 0,
    });
    expect(response).toMatchObject({
      role_ids: [ROLE_ID],
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employees.roles_assigned',
        reason: 'Promoted.',
      }),
    );
  });

  it('blocks demoting the last active Shop Owner through role assignment', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord({
      roleIds: [SHOP_OWNER_ROLE_ID],
    });
    store.employeeIsOwner = true;
    store.otherActiveOwnerCount = 0;
    store.activeRoles = [{ id: ROLE_ID, roleType: 'custom' }];

    await expect(
      service.assignRoles(
        EMPLOYEE_ID,
        {
          role_ids: [ROLE_ID],
          lock_version: 0,
        },
        createTenantSession(['users.assign_roles']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'last_active_shop_owner' })],
    });
  });

  it('assigns active branches and tenant-wide branch access with audit logging', async () => {
    const { service, store, auditService } = createService();
    store.employeeById = createEmployeeRecord();
    store.activeBranchIds = [BRANCH_ID];
    store.branchAssignedEmployee = createEmployeeRecord({
      branchIds: [BRANCH_ID],
      tenantWideBranchAccess: false,
      lockVersion: 1,
    });

    const response = await service.assignBranches(
      EMPLOYEE_ID,
      {
        branch_ids: [BRANCH_ID],
        tenant_wide_branch_access: false,
        lock_version: 0,
        change_reason: 'Assigned to main branch.',
      },
      createTenantSession(['users.assign_branches']),
    );

    expect(store.branchAssignmentInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      userId: EMPLOYEE_USER_ID,
      branchIds: [BRANCH_ID],
      tenantWideBranchAccess: false,
      expectedLockVersion: 0,
    });
    expect(response).toMatchObject({
      branch_ids: [BRANCH_ID],
      tenant_wide_branch_access: false,
      lock_version: 1,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employees.branches_assigned',
        reason: 'Assigned to main branch.',
      }),
    );
  });

  it('blocks assigning unknown or inactive branches', async () => {
    const { service, store } = createService();
    store.employeeById = createEmployeeRecord();
    store.activeBranchIds = [];

    await expect(
      service.assignBranches(
        EMPLOYEE_ID,
        {
          branch_ids: [BRANCH_ID],
          tenant_wide_branch_access: false,
          lock_version: 0,
        },
        createTenantSession(['users.assign_branches']),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [expect.objectContaining({ code: 'unknown_or_inactive_branch' })],
    });
  });

  it('lists invitations and audit-logs pending invitation expiration', async () => {
    const { service, store, auditService } = createService();
    store.expiredInvitations = [
      createInvitationRecord({
        status: 'expired',
        expiresAt: new Date('2026-06-20T00:00:00.000Z'),
      }),
    ];
    store.invitations = [createInvitationRecord({ status: 'expired' })];

    const response = await service.listInvitations(createTenantSession(['users.read']));

    expect(response.invitations).toHaveLength(1);
    expect(response.invitations[0]).toMatchObject({
      id: INVITATION_ID,
      status: 'expired',
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        action: 'employee_invitations.expired',
        entityType: 'employee_invitation',
      }),
    );
  });

  it('revokes pending invitations and writes an audit log', async () => {
    const { service, store, auditService } = createService();
    store.invitationById = createInvitationRecord();
    store.revokedInvitation = createInvitationRecord({
      status: 'revoked',
      revokedAt: NOW,
    });

    const response = await service.revokeInvitation(
      INVITATION_ID,
      { reason: 'Wrong email.' },
      createTenantSession(['users.create']),
    );

    expect(store.revokedInvitationInputs[0]).toMatchObject({
      tenantId: TENANT_ID,
      invitationId: INVITATION_ID,
    });
    expect(response).toMatchObject({
      status: 'revoked',
      revoked_at: NOW.toISOString(),
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee_invitations.revoked',
        reason: 'Wrong email.',
      }),
    );
  });
});

function createService(): {
  readonly service: EmployeesService;
  readonly store: FakeEmployeeStore;
  readonly auditService: AuditService;
} {
  const store = new FakeEmployeeStore();
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
  const passwordHashingService = {
    hashPassword: vi.fn(async () => 'hashed-random-password'),
  } as unknown as PasswordHashingService;
  const secureTokenService = {
    generateOpaqueToken: vi.fn(() => 'opaque-token'),
  } as unknown as SecureTokenService;
  const tokenHashingService = {
    hashToken: vi.fn(() => 'hashed-token'),
  } as unknown as TokenHashingService;

  return {
    service: new EmployeesService(
      store,
      new FakeTransactionRunner(),
      auditService,
      passwordHashingService,
      secureTokenService,
      tokenHashingService,
    ),
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

function createEmployeeRecord(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: overrides.id ?? EMPLOYEE_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    userId: overrides.userId ?? EMPLOYEE_USER_ID,
    fullName: overrides.fullName ?? 'Garage Tech',
    email: overrides.email ?? 'tech@example.com',
    normalizedEmail: overrides.normalizedEmail ?? 'tech@example.com',
    mobileNumber: overrides.mobileNumber ?? '+639171234567',
    status: overrides.status ?? 'active',
    userStatus: overrides.userStatus ?? overrides.status ?? 'active',
    tenantWideBranchAccess: overrides.tenantWideBranchAccess ?? false,
    roleIds: overrides.roleIds ?? [],
    branchIds: overrides.branchIds ?? [],
    lockVersion: overrides.lockVersion ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    deactivatedAt: overrides.deactivatedAt ?? null,
    reactivatedAt: overrides.reactivatedAt ?? null,
  };
}

function createInvitationRecord(
  overrides: Partial<EmployeeInvitationRecord> = {},
): EmployeeInvitationRecord {
  return {
    id: overrides.id ?? INVITATION_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    email: overrides.email ?? 'invitee@example.com',
    normalizedEmail: overrides.normalizedEmail ?? 'invitee@example.com',
    status: overrides.status ?? 'pending',
    expiresAt: overrides.expiresAt ?? new Date('2026-07-04T00:00:00.000Z'),
    acceptedAt: overrides.acceptedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    createdByUserId: overrides.createdByUserId ?? USER_ID,
    createdAt: overrides.createdAt ?? NOW,
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

class FakeEmployeeStore extends EmployeeStore {
  isOwner = false;
  employeeIsOwner = false;
  employees: EmployeeRecord[] = [];
  employeeById: EmployeeRecord | null = null;
  createdEmployee: EmployeeRecord | null = null;
  updatedEmployee: EmployeeRecord | null = createEmployeeRecord({ lockVersion: 1 });
  changedEmployee: EmployeeRecord | null = createEmployeeRecord({ lockVersion: 1 });
  activeUserEmailExists = false;
  pendingInvitationAlreadyExists = false;
  otherActiveOwnerCount = 1;
  activeRoleCount = 1;
  activeBranchAssignmentCount = 1;
  activeRoles: ActiveRoleRecord[] = [{ id: ROLE_ID, roleType: 'custom' }];
  activeBranchIds: string[] = [BRANCH_ID];
  roleAssignedEmployee: EmployeeRecord | null = createEmployeeRecord({
    roleIds: [ROLE_ID],
    lockVersion: 1,
  });
  branchAssignedEmployee: EmployeeRecord | null = createEmployeeRecord({
    branchIds: [BRANCH_ID],
    lockVersion: 1,
  });
  invitations: EmployeeInvitationRecord[] = [];
  invitationById: EmployeeInvitationRecord | null = null;
  expiredInvitations: EmployeeInvitationRecord[] = [];
  revokedInvitation: EmployeeInvitationRecord | null = null;
  readonly listTenantIds: string[] = [];
  readonly findInputs: Array<{ tenantId: string; employeeId: string }> = [];
  readonly createdInputs: CreateEmployeeInput[] = [];
  readonly updatedInputs: UpdateEmployeeInput[] = [];
  readonly changedInputs: ChangeEmployeeStatusInput[] = [];
  readonly revokedUserIds: string[] = [];
  readonly passwordResetTokenInputs: Array<{
    readonly id: string;
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }> = [];
  readonly invitationInputs: CreateInvitationInput[] = [];
  readonly roleAssignmentInputs: ReplaceEmployeeRolesInput[] = [];
  readonly branchAssignmentInputs: ReplaceEmployeeBranchesInput[] = [];
  readonly revokedInvitationInputs: RevokeInvitationInput[] = [];

  async isActiveShopOwner(input: { readonly userId: string }): Promise<boolean> {
    return input.userId === EMPLOYEE_USER_ID ? this.employeeIsOwner : this.isOwner;
  }

  async listEmployees(tenantId: string): Promise<readonly EmployeeRecord[]> {
    this.listTenantIds.push(tenantId);

    return this.employees;
  }

  async findEmployeeById(tenantId: string, employeeId: string): Promise<EmployeeRecord | null> {
    this.findInputs.push({ tenantId, employeeId });

    return this.employeeById;
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    this.createdInputs.push(input);

    return (
      this.createdEmployee ??
      createEmployeeRecord({
        id: input.employeeId,
        tenantId: input.tenantId,
        userId: input.userId,
        fullName: input.fullName,
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        mobileNumber: input.mobileNumber,
        status: 'inactive',
        userStatus: 'inactive',
      })
    );
  }

  async updateEmployee(input: UpdateEmployeeInput): Promise<EmployeeRecord | null> {
    this.updatedInputs.push(input);

    return this.updatedEmployee;
  }

  async changeEmployeeStatus(input: ChangeEmployeeStatusInput): Promise<EmployeeRecord | null> {
    this.changedInputs.push(input);

    return this.changedEmployee;
  }

  async findActiveRolesByIds(): Promise<readonly ActiveRoleRecord[]> {
    return this.activeRoles;
  }

  async findActiveBranchesByIds(): Promise<readonly string[]> {
    return this.activeBranchIds;
  }

  async replaceEmployeeRoles(input: ReplaceEmployeeRolesInput): Promise<EmployeeRecord | null> {
    this.roleAssignmentInputs.push(input);

    return this.roleAssignedEmployee;
  }

  async replaceEmployeeBranches(
    input: ReplaceEmployeeBranchesInput,
  ): Promise<EmployeeRecord | null> {
    this.branchAssignmentInputs.push(input);

    return this.branchAssignedEmployee;
  }

  async revokeRefreshSessionsForUser(input: { readonly userId: string }): Promise<void> {
    this.revokedUserIds.push(input.userId);
  }

  async createPasswordResetToken(input: {
    readonly id: string;
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    this.passwordResetTokenInputs.push(input);
  }

  async countActiveShopOwners(): Promise<number> {
    return this.otherActiveOwnerCount;
  }

  async countActiveRolesForUser(): Promise<number> {
    return this.activeRoleCount;
  }

  async countActiveBranchAssignmentsForUser(): Promise<number> {
    return this.activeBranchAssignmentCount;
  }

  async activeUserExistsByNormalizedEmail(): Promise<boolean> {
    return this.activeUserEmailExists;
  }

  async pendingInvitationExists(): Promise<boolean> {
    return this.pendingInvitationAlreadyExists;
  }

  async listInvitations(): Promise<readonly EmployeeInvitationRecord[]> {
    return this.invitations;
  }

  async findInvitationById(): Promise<EmployeeInvitationRecord | null> {
    return this.invitationById;
  }

  async expirePendingInvitations(): Promise<readonly EmployeeInvitationRecord[]> {
    return this.expiredInvitations;
  }

  async createInvitation(input: CreateInvitationInput): Promise<EmployeeInvitationRecord> {
    this.invitationInputs.push(input);

    return createInvitationRecord({
      id: input.id,
      tenantId: input.tenantId,
      email: input.email,
      normalizedEmail: input.normalizedEmail,
      expiresAt: input.expiresAt,
      createdByUserId: input.createdByUserId,
    });
  }

  async revokeInvitation(input: RevokeInvitationInput): Promise<EmployeeInvitationRecord | null> {
    this.revokedInvitationInputs.push(input);

    return this.revokedInvitation;
  }
}
