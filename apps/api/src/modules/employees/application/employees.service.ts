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
import { PasswordHashingService } from '../../auth/application/password-hashing.service';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import {
  type AssignEmployeeBranchesRequest,
  type AssignEmployeeRolesRequest,
  type CreateEmployeeInvitationRequest,
  type CreateEmployeeRequest,
  type EmployeeStatusChangeRequest,
  type RevokeEmployeeInvitationRequest,
  type UpdateEmployeeRequest,
} from '../api/employee.schemas';
import {
  type ActiveRoleRecord,
  EmployeeStore,
  type EmployeeInvitationRecord,
  type EmployeeRecord,
} from './employee.store';

export interface EmployeeResponse {
  readonly id: string;
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly mobile_number: string | null;
  readonly status: 'active' | 'inactive';
  readonly tenant_wide_branch_access: boolean;
  readonly role_ids: readonly string[];
  readonly branch_ids: readonly string[];
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface EmployeeListResponse {
  readonly employees: readonly EmployeeResponse[];
}

export interface EmployeeInvitationResponse {
  readonly id: string;
  readonly email: string;
  readonly status: 'pending' | 'accepted' | 'revoked' | 'expired';
  readonly expires_at: string;
  readonly created_at: string;
  readonly accepted_at: string | null;
  readonly revoked_at: string | null;
}

export interface EmployeeInvitationListResponse {
  readonly invitations: readonly EmployeeInvitationResponse[];
}

const IDEMPOTENCY_RETENTION_HOURS = 24;
const INVITATION_EXPIRES_DAYS = 7;
const PASSWORD_RESET_EXPIRES_MINUTES = 30;
const SHOP_OWNER_ROLE_TYPE = 'shop_owner';

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(EmployeeStore)
    private readonly employeeStore: EmployeeStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(PasswordHashingService)
    private readonly passwordHashingService: PasswordHashingService,
    @Inject(SecureTokenService)
    private readonly secureTokenService: SecureTokenService,
    @Inject(TokenHashingService)
    private readonly tokenHashingService: TokenHashingService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listEmployees(session: TenantContextAuthenticatedSession): Promise<EmployeeListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'users.read');

    const employees = await this.employeeStore.listEmployees(context.tenantId);

    return {
      employees: employees.map(toEmployeeResponse),
    };
  }

  async getEmployee(
    employeeId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'users.read');

    const employee = await this.employeeStore.findEmployeeById(context.tenantId, employeeId.trim());

    if (employee === null) {
      throw GarageOsApiException.resourceNotFound('Employee was not found.');
    }

    return toEmployeeResponse(employee);
  }

  async createEmployee(
    request: CreateEmployeeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.create');

    const now = new Date();
    const normalizedEmail = normalizeEmail(request.email);
    const setupToken = this.secureTokenService.generateOpaqueToken();
    const randomPassword = this.secureTokenService.generateOpaqueToken();
    const passwordHash = await this.passwordHashingService.hashPassword(randomPassword);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      if (
        await this.employeeStore.activeUserExistsByNormalizedEmail(normalizedEmail, transaction)
      ) {
        throw GarageOsApiException.duplicateResource(
          'An active user with this email already exists.',
        );
      }

      const employee = await translateDuplicateActiveEmail(async () =>
        this.employeeStore.createEmployee(
          {
            employeeId: randomUUID(),
            userId: randomUUID(),
            tenantId: context.tenantId,
            fullName: request.full_name.trim(),
            email: request.email.trim(),
            normalizedEmail,
            passwordHash,
            mobileNumber: normalizeNullableText(request.mobile_number),
            createdAt: now,
          },
          transaction,
        ),
      );

      await this.employeeStore.createPasswordResetToken(
        {
          id: randomUUID(),
          userId: employee.userId,
          tokenHash: this.tokenHashingService.hashToken(setupToken),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000),
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employees.created',
        entityType: 'employee',
        entityId: employee.id,
        afterJson: toEmployeeResponse(employee),
        reason: 'employee_created_with_password_setup',
        client: transaction,
      });

      return toEmployeeResponse(employee);
    });
  }

  async updateEmployee(
    employeeId: string,
    request: UpdateEmployeeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.update');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.employeeStore.findEmployeeById(
        context.tenantId,
        employeeId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee was not found.');
      }

      const updated = await this.employeeStore.updateEmployee(
        {
          tenantId: context.tenantId,
          employeeId: existing.id,
          fullName: request.full_name.trim(),
          mobileNumber: normalizeNullableText(request.mobile_number),
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedAt: new Date(),
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employees.updated',
        entityType: 'employee',
        entityId: updated.id,
        beforeJson: toEmployeeResponse(existing),
        afterJson: toEmployeeResponse(updated),
        reason: 'employee_profile_updated',
        client: transaction,
      });

      return toEmployeeResponse(updated);
    });
  }

  async assignRoles(
    employeeId: string,
    request: AssignEmployeeRolesRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.assign_roles');

    const requestedRoleIds = normalizeIdList(request.role_ids);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.employeeStore.findEmployeeById(
        context.tenantId,
        employeeId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee was not found.');
      }

      const activeRoles = await this.employeeStore.findActiveRolesByIds(
        context.tenantId,
        requestedRoleIds,
        transaction,
      );

      assertAllRequestedRolesAreActive(requestedRoleIds, activeRoles);

      await this.assertLastShopOwnerIsNotDemoted(existing, activeRoles, context, transaction);

      const changed = await this.employeeStore.replaceEmployeeRoles(
        {
          tenantId: context.tenantId,
          userId: existing.userId,
          roleIds: requestedRoleIds,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          changedAt: new Date(),
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
        action: 'employees.roles_assigned',
        entityType: 'employee',
        entityId: changed.id,
        beforeJson: toEmployeeResponse(existing),
        afterJson: toEmployeeResponse(changed),
        metadataJson: {
          previous_role_ids: existing.roleIds,
          next_role_ids: changed.roleIds,
        },
        reason: normalizeNullableText(request.change_reason) ?? 'employee_roles_assigned',
        client: transaction,
      });

      return toEmployeeResponse(changed);
    });
  }

  async assignBranches(
    employeeId: string,
    request: AssignEmployeeBranchesRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.assign_branches');

    const nextTenantWideBranchAccess = request.tenant_wide_branch_access === true;
    const requestedBranchIds = normalizeIdList(request.branch_ids ?? []);

    if (!nextTenantWideBranchAccess && requestedBranchIds.length === 0) {
      throw employeeRequiresBranchAssignmentError();
    }

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.employeeStore.findEmployeeById(
        context.tenantId,
        employeeId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee was not found.');
      }

      const activeBranchIds = await this.employeeStore.findActiveBranchesByIds(
        context.tenantId,
        requestedBranchIds,
        transaction,
      );

      assertAllRequestedBranchesAreActive(requestedBranchIds, activeBranchIds);

      const changed = await this.employeeStore.replaceEmployeeBranches(
        {
          tenantId: context.tenantId,
          employeeId: existing.id,
          userId: existing.userId,
          branchIds: requestedBranchIds,
          tenantWideBranchAccess: nextTenantWideBranchAccess,
          assignedByUserId: context.actorUserId,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          changedAt: new Date(),
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
        action: 'employees.branches_assigned',
        entityType: 'employee',
        entityId: changed.id,
        beforeJson: toEmployeeResponse(existing),
        afterJson: toEmployeeResponse(changed),
        metadataJson: {
          previous_branch_ids: existing.branchIds,
          next_branch_ids: changed.branchIds,
          previous_tenant_wide_branch_access: existing.tenantWideBranchAccess,
          next_tenant_wide_branch_access: changed.tenantWideBranchAccess,
        },
        reason: normalizeNullableText(request.change_reason) ?? 'employee_branches_assigned',
        client: transaction,
      });

      return toEmployeeResponse(changed);
    });
  }

  async deactivateEmployee(
    employeeId: string,
    request: EmployeeStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.deactivate');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.employeeStore.findEmployeeById(
        context.tenantId,
        employeeId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee was not found.');
      }

      if (existing.status !== 'active' || existing.userStatus !== 'active') {
        throw invalidEmployeeStatus('active');
      }

      if (await this.isLastActiveShopOwner(context.tenantId, existing.userId, transaction)) {
        throw lastActiveShopOwnerError();
      }

      const changedAt = new Date();
      const changed = await this.employeeStore.changeEmployeeStatus(
        {
          tenantId: context.tenantId,
          employeeId: existing.id,
          fromStatus: 'active',
          toStatus: 'inactive',
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          changedAt,
        },
        transaction,
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.employeeStore.revokeRefreshSessionsForUser(
        {
          userId: changed.userId,
          revokedAt: changedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employees.deactivated',
        entityType: 'employee',
        entityId: changed.id,
        beforeJson: toEmployeeResponse(existing),
        afterJson: toEmployeeResponse(changed),
        reason: normalizeNullableText(request.reason) ?? 'employee_deactivated',
        client: transaction,
      });

      return toEmployeeResponse(changed);
    });
  }

  async reactivateEmployee(
    employeeId: string,
    request: EmployeeStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.update');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.employeeStore.findEmployeeById(
        context.tenantId,
        employeeId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee was not found.');
      }

      if (existing.status !== 'inactive' || existing.userStatus !== 'inactive') {
        throw invalidEmployeeStatus('inactive');
      }

      await this.assertReactivateAllowed(existing, transaction);

      const changed = await translateDuplicateActiveEmail(async () =>
        this.employeeStore.changeEmployeeStatus(
          {
            tenantId: context.tenantId,
            employeeId: existing.id,
            fromStatus: 'inactive',
            toStatus: 'active',
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            changedAt: new Date(),
          },
          transaction,
        ),
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employees.reactivated',
        entityType: 'employee',
        entityId: changed.id,
        beforeJson: toEmployeeResponse(existing),
        afterJson: toEmployeeResponse(changed),
        reason: normalizeNullableText(request.reason) ?? 'employee_reactivated',
        client: transaction,
      });

      return toEmployeeResponse(changed);
    });
  }

  async listInvitations(
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeInvitationListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });

    assertPermission(context, isShopOwner, 'users.read');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await this.expirePendingInvitations(context, new Date(), transaction);

      const invitations = await this.employeeStore.listInvitations(context.tenantId, transaction);

      return {
        invitations: invitations.map(toInvitationResponse),
      };
    });
  }

  async createInvitation(
    request: CreateEmployeeInvitationRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeInvitationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.create');

    const now = new Date();
    const normalizedEmail = normalizeEmail(request.email);
    const invitationToken = this.secureTokenService.generateOpaqueToken();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await this.expirePendingInvitations(context, now, transaction);

      if (
        await this.employeeStore.activeUserExistsByNormalizedEmail(normalizedEmail, transaction)
      ) {
        throw GarageOsApiException.duplicateResource(
          'An active user with this email already exists.',
        );
      }

      if (
        await this.employeeStore.pendingInvitationExists(
          {
            tenantId: context.tenantId,
            normalizedEmail,
          },
          transaction,
        )
      ) {
        throw GarageOsApiException.duplicateResource(
          'A pending invitation already exists for this email.',
        );
      }

      const invitation = await this.employeeStore.createInvitation(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          email: request.email.trim(),
          normalizedEmail,
          tokenHash: this.tokenHashingService.hashToken(invitationToken),
          expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
          createdByUserId: context.actorUserId,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employee_invitations.created',
        entityType: 'employee_invitation',
        entityId: invitation.id,
        afterJson: toInvitationResponse(invitation),
        reason: 'employee_invitation_created',
        client: transaction,
      });

      return toInvitationResponse(invitation);
    });
  }

  async revokeInvitation(
    invitationId: string,
    request: RevokeEmployeeInvitationRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EmployeeInvitationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.isShopOwner(context);

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });

    assertPermission(context, isShopOwner, 'users.create');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const now = new Date();
      await this.expirePendingInvitations(context, now, transaction);

      const existing = await this.employeeStore.findInvitationById(
        context.tenantId,
        invitationId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Employee invitation was not found.');
      }

      const revoked = await this.employeeStore.revokeInvitation(
        {
          tenantId: context.tenantId,
          invitationId: existing.id,
          revokedAt: now,
        },
        transaction,
      );

      if (revoked === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'invitation_id',
            code: 'employee_invitation_not_revokable',
            message:
              'Employee invitation must be pending, unused, unexpired, and not revoked before it can be revoked.',
          },
        ]);
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'employee_invitations.revoked',
        entityType: 'employee_invitation',
        entityId: revoked.id,
        beforeJson: toInvitationResponse(existing),
        afterJson: toInvitationResponse(revoked),
        reason: normalizeNullableText(request.reason) ?? 'employee_invitation_revoked',
        client: transaction,
      });

      return toInvitationResponse(revoked);
    });
  }

  private isShopOwner(context: ResolvedTenantContext): Promise<boolean> {
    return this.employeeStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });
  }

  private async isLastActiveShopOwner(
    tenantId: string,
    userId: string,
    client: Parameters<EmployeeStore['countActiveShopOwners']>[1],
  ): Promise<boolean> {
    const isOwner = await this.employeeStore.isActiveShopOwner({ tenantId, userId }, client);

    if (!isOwner) {
      return false;
    }

    const otherOwnerCount = await this.employeeStore.countActiveShopOwners(
      {
        tenantId,
        excludingUserId: userId,
      },
      client,
    );

    return otherOwnerCount === 0;
  }

  private async assertLastShopOwnerIsNotDemoted(
    employee: EmployeeRecord,
    nextRoles: readonly ActiveRoleRecord[],
    context: ResolvedTenantContext,
    client: Parameters<EmployeeStore['countActiveShopOwners']>[1],
  ): Promise<void> {
    const currentlyShopOwner = await this.employeeStore.isActiveShopOwner(
      {
        tenantId: context.tenantId,
        userId: employee.userId,
      },
      client,
    );

    if (!currentlyShopOwner) {
      return;
    }

    const remainsShopOwner = nextRoles.some((role) => role.roleType === SHOP_OWNER_ROLE_TYPE);

    if (remainsShopOwner) {
      return;
    }

    const otherOwnerCount = await this.employeeStore.countActiveShopOwners(
      {
        tenantId: context.tenantId,
        excludingUserId: employee.userId,
      },
      client,
    );

    if (otherOwnerCount === 0) {
      throw lastActiveShopOwnerError();
    }
  }

  private async assertReactivateAllowed(
    employee: EmployeeRecord,
    client: Parameters<EmployeeStore['countActiveRolesForUser']>[1],
  ): Promise<void> {
    if (
      await this.employeeStore.activeUserExistsByNormalizedEmail(employee.normalizedEmail, client)
    ) {
      throw GarageOsApiException.duplicateResource(
        'An active user with this email already exists.',
      );
    }

    const activeRoleCount = await this.employeeStore.countActiveRolesForUser(
      {
        tenantId: employee.tenantId,
        userId: employee.userId,
      },
      client,
    );

    if (activeRoleCount === 0) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'employee_id',
          code: 'employee_requires_active_role',
          message: 'Employee must have at least one active role before reactivation.',
        },
      ]);
    }

    if (!employee.tenantWideBranchAccess) {
      const activeBranchAssignmentCount =
        await this.employeeStore.countActiveBranchAssignmentsForUser(
          {
            tenantId: employee.tenantId,
            userId: employee.userId,
          },
          client,
        );

      if (activeBranchAssignmentCount === 0) {
        throw employeeRequiresBranchAssignmentError();
      }
    }
  }

  private async expirePendingInvitations(
    context: ResolvedTenantContext,
    now: Date,
    client: Parameters<EmployeeStore['expirePendingInvitations']>[1],
  ): Promise<void> {
    const expiredInvitations = await this.employeeStore.expirePendingInvitations(
      {
        tenantId: context.tenantId,
        expiredAt: now,
      },
      client,
    );

    for (const invitation of expiredInvitations) {
      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: null,
        actorType: AUDIT_ACTOR_TYPES.SYSTEM,
        action: 'employee_invitations.expired',
        entityType: 'employee_invitation',
        entityId: invitation.id,
        afterJson: toInvitationResponse(invitation),
        reason: 'employee_invitation_expired',
        client,
      });
    }
  }
}

function toEmployeeResponse(employee: EmployeeRecord): EmployeeResponse {
  return {
    id: employee.id,
    user_id: employee.userId,
    full_name: employee.fullName,
    email: employee.email,
    mobile_number: employee.mobileNumber,
    status: employee.status,
    tenant_wide_branch_access: employee.tenantWideBranchAccess,
    role_ids: employee.roleIds,
    branch_ids: employee.branchIds,
    lock_version: employee.lockVersion,
    created_at: employee.createdAt.toISOString(),
    updated_at: employee.updatedAt.toISOString(),
    deactivated_at: employee.deactivatedAt?.toISOString() ?? null,
    reactivated_at: employee.reactivatedAt?.toISOString() ?? null,
  };
}

function toInvitationResponse(invitation: EmployeeInvitationRecord): EmployeeInvitationResponse {
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    expires_at: invitation.expiresAt.toISOString(),
    created_at: invitation.createdAt.toISOString(),
    accepted_at: invitation.acceptedAt?.toISOString() ?? null,
    revoked_at: invitation.revokedAt?.toISOString() ?? null,
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIdList(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function invalidEmployeeStatus(expectedStatus: 'active' | 'inactive'): GarageOsApiException {
  return GarageOsApiException.validationFailed([
    {
      field: 'status',
      code: 'invalid_employee_status',
      message: `Employee must be ${expectedStatus} before this action.`,
    },
  ]);
}

function employeeRequiresBranchAssignmentError(): GarageOsApiException {
  return GarageOsApiException.validationFailed([
    {
      field: 'branch_ids',
      code: 'employee_requires_active_branch_assignment',
      message:
        'Employee must have an active branch assignment or tenant-wide branch access before access can be enabled.',
    },
  ]);
}

function lastActiveShopOwnerError(): GarageOsApiException {
  return GarageOsApiException.validationFailed([
    {
      field: 'employee_id',
      code: 'last_active_shop_owner',
      message: 'Tenant must keep at least one active Shop Owner.',
    },
  ]);
}

function assertAllRequestedRolesAreActive(
  requestedRoleIds: readonly string[],
  activeRoles: readonly ActiveRoleRecord[],
): void {
  const activeRoleIds = new Set(activeRoles.map((role) => role.id));
  const missingRoleIds = requestedRoleIds.filter((roleId) => !activeRoleIds.has(roleId));

  if (missingRoleIds.length === 0) {
    return;
  }

  throw GarageOsApiException.validationFailed(
    missingRoleIds.map((roleId) => ({
      field: 'role_ids',
      code: 'unknown_or_inactive_role',
      message: `Role is unknown or inactive for this tenant: ${roleId}`,
    })),
  );
}

function assertAllRequestedBranchesAreActive(
  requestedBranchIds: readonly string[],
  activeBranchIds: readonly string[],
): void {
  const activeBranchIdSet = new Set(activeBranchIds);
  const missingBranchIds = requestedBranchIds.filter(
    (branchId) => !activeBranchIdSet.has(branchId),
  );

  if (missingBranchIds.length === 0) {
    return;
  }

  throw GarageOsApiException.validationFailed(
    missingBranchIds.map((branchId) => ({
      field: 'branch_ids',
      code: 'unknown_or_inactive_branch',
      message: `Branch is unknown or inactive for this tenant: ${branchId}`,
    })),
  );
}

async function translateDuplicateActiveEmail<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveUserEmailUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active user with this email already exists.',
      );
    }

    throw error;
  }
}

function isActiveUserEmailUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint ===
      'ux_users_active_normalized_email'
  );
}
