import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type { AuthSessionResponseData } from '../../auth/contracts';
import { PLATFORM_PERMISSIONS, PlatformTenantService } from './platform-tenant.service';
import { PlatformTenantOperationsStore } from './platform-tenant-operations.store';
import type {
  CreateSupportAccessSessionRequest,
  EndSupportAccessSessionRequest,
  TenantDeletionJobRequest,
  TenantExportPlaceholderRequest,
  TenantStatusOverrideRequest,
} from '../api/platform-tenant-operations.schemas';

export interface PlatformRequestAuditContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

@Injectable()
export class PlatformTenantOperationsService {
  constructor(
    @Inject(PlatformTenantOperationsStore)
    private readonly store: PlatformTenantOperationsStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(PlatformTenantService)
    private readonly platformTenantService: PlatformTenantService,
  ) {}

  async createSupportAccessSession(
    tenantId: string,
    request: CreateSupportAccessSessionRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    this.platformTenantService.assertPlatformPermission(session, 'platform.support_access');

    const expiresAt = new Date(request.expires_at);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'expires_at',
          code: 'must_be_future',
          message: 'Support access expiration must be in the future.',
        },
      ]);
    }

    const now = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.store.findTenantForOperation(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      const supportSession = await this.store.createSupportAccessSession(
        {
          id: randomUUID(),
          tenantId,
          platformAdminUserId: session.user.id,
          accessMode: request.access_mode,
          reason: request.reason.trim(),
          startedAt: now,
          expiresAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId,
        actorUserId: session.user.id,
        actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
        action: 'platform.support_access.started',
        entityType: 'platform_support_access_session',
        entityId: supportSession.id,
        afterJson: {
          access_mode: supportSession.accessMode,
          reason: supportSession.reason,
          started_at: supportSession.startedAt.toISOString(),
          expires_at: supportSession.expiresAt.toISOString(),
        },
        reason: request.reason.trim(),
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        client: transaction,
      });

      return {
        id: supportSession.id,
        tenant_id: supportSession.tenantId,
        access_mode: supportSession.accessMode,
        started_at: supportSession.startedAt.toISOString(),
        expires_at: supportSession.expiresAt.toISOString(),
      };
    });
  }

  async endSupportAccessSession(
    supportAccessSessionId: string,
    request: EndSupportAccessSessionRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    this.platformTenantService.assertPlatformPermission(session, 'platform.support_access');

    const now = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const ended = await this.store.endSupportAccessSession(
        {
          id: supportAccessSessionId,
          endedAt: now,
        },
        transaction,
      );

      if (ended === null) {
        throw GarageOsApiException.resourceNotFound('Active support access session was not found.');
      }

      await this.auditService.record({
        tenantId: ended.tenantId,
        actorUserId: session.user.id,
        actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
        action: 'platform.support_access.ended',
        entityType: 'platform_support_access_session',
        entityId: ended.id,
        afterJson: {
          ended_at: now.toISOString(),
        },
        reason: request.reason?.trim() ?? 'support_access_ended',
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        client: transaction,
      });

      return {
        id: ended.id,
        tenant_id: ended.tenantId,
        ended_at: now.toISOString(),
      };
    });
  }

  async applyReadOnlyOverride(
    tenantId: string,
    request: TenantStatusOverrideRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    return this.applyTenantStatusOverride(
      'platform_read_only_override',
      'read_only',
      tenantId,
      request,
      session,
      auditContext,
    );
  }

  async suspendTenant(
    tenantId: string,
    request: TenantStatusOverrideRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    return this.applyTenantStatusOverride(
      'platform_suspension_override',
      'suspended',
      tenantId,
      request,
      session,
      auditContext,
    );
  }

  async queueTenantExportPlaceholder(
    tenantId: string,
    request: TenantExportPlaceholderRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    this.platformTenantService.assertPlatformPermission(
      session,
      PLATFORM_PERMISSIONS.TENANTS_UPDATE,
    );

    const now = new Date();
    const jobId = randomUUID();

    await this.auditService.record({
      tenantId,
      actorUserId: session.user.id,
      actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
      action: 'platform.tenant_export.placeholder_queued',
      entityType: 'tenant_export_job',
      entityId: jobId,
      afterJson: {
        status: 'queued',
        include_attachments: request.include_attachments,
        include_soft_deleted: request.include_soft_deleted,
        metadata_only: request.metadata_only,
      },
      reason: request.reason?.trim() ?? 'platform_tenant_export_requested',
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return {
      id: jobId,
      tenant_id: tenantId,
      status: 'queued',
      requested_at: now.toISOString(),
    };
  }

  async queueTenantDeletionJob(
    tenantId: string,
    request: TenantDeletionJobRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    this.platformTenantService.assertPlatformPermission(
      session,
      PLATFORM_PERMISSIONS.TENANTS_UPDATE,
    );

    const now = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.store.findTenantForOperation(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      if (tenant.status !== 'pending_deletion') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'tenant.status',
            code: 'tenant_not_pending_deletion',
            message: 'Tenant deletion can only be queued for pending deletion tenants.',
          },
        ]);
      }

      const scheduledFor =
        tenant.deletionScheduledFor ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const jobId = randomUUID();

      await this.store.queueTenantDeletionJob(
        {
          id: jobId,
          tenantId,
          scheduledFor,
          createdAt: now,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId,
        actorUserId: session.user.id,
        actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
        action: 'platform.tenant_deletion_job.queued',
        entityType: 'tenant_deletion_job',
        entityId: jobId,
        afterJson: {
          scheduled_for: scheduledFor.toISOString(),
          status: 'queued',
        },
        reason: request.reason.trim(),
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        client: transaction,
      });

      return {
        id: jobId,
        tenant_id: tenantId,
        status: 'queued',
        scheduled_for: scheduledFor.toISOString(),
      };
    });
  }

  private async applyTenantStatusOverride(
    overrideType: string,
    toStatus: 'read_only' | 'suspended',
    tenantId: string,
    request: TenantStatusOverrideRequest,
    session: AuthSessionResponseData,
    auditContext: PlatformRequestAuditContext,
  ) {
    this.platformTenantService.assertPlatformPermission(
      session,
      PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE,
    );

    const now = new Date();
    const expiresAt = request.expires_at ? new Date(request.expires_at) : null;

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.store.findTenantForOperation(tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      await this.store.applyTenantStatusOverride(
        {
          id: randomUUID(),
          tenantId,
          fromStatus: tenant.status,
          toStatus,
          overrideType,
          previousValueJson: {
            status: tenant.status,
          },
          newValueJson: {
            status: toStatus,
            expires_at: expiresAt?.toISOString() ?? null,
          },
          reason: request.reason.trim(),
          expiresAt,
          platformAdminUserId: session.user.id,
          effectiveAt: now,
          lifecycleEventId: randomUUID(),
        },
        transaction,
      );

      await this.auditService.record({
        tenantId,
        actorUserId: session.user.id,
        actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
        action: `platform.tenant_status.${toStatus}.applied`,
        entityType: 'tenant',
        entityId: tenantId,
        beforeJson: {
          status: tenant.status,
        },
        afterJson: {
          status: toStatus,
          expires_at: expiresAt?.toISOString() ?? null,
        },
        reason: request.reason.trim(),
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        client: transaction,
      });

      return {
        tenant_id: tenantId,
        status: toStatus,
        status_source: 'platform_override',
      };
    });
  }
}
