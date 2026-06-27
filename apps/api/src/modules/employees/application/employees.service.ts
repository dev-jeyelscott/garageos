import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { PasswordHashingService } from '../../auth/application/password-hashing.service';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import {
  type CreateEmployeeInvitationRequest,
  type CreateEmployeeRequest,
  type EmployeeStatusChangeRequest,
  type UpdateEmployeeRequest,
} from '../api/employee.schemas';
import {
  EmployeeStore,
  type EmployeeRecord,
  type EmployeeInvitationRecord,
} from './employee.store';

export interface EmployeeResponse {
  readonly id: string;
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly mobile_number: string | null;
  readonly status: 'active' | 'inactive';
  readonly tenant_wide_branch_access: boolean;
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
}

const IDEMPOTENCY_RETENTION_HOURS = 24;
const INVITATION_EXPIRES_DAYS = 7;
const PASSWORD_RESET_EXPIRES_MINUTES = 30;

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
        throw GarageOsApiException.validationFailed([
          {
            field: 'employee_id',
            code: 'last_active_shop_owner',
            message: 'Tenant must keep at least one active Shop Owner.',
          },
        ]);
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
    const isOwner = await this.employeeStore.isActiveShopOwner({ tenantId, userId });

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
        throw GarageOsApiException.validationFailed([
          {
            field: 'employee_id',
            code: 'employee_requires_active_branch_assignment',
            message:
              'Employee must have an active branch assignment or tenant-wide branch access before reactivation.',
          },
        ]);
      }
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
