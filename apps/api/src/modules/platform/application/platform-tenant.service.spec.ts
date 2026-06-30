import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { BackgroundJobRecord } from '../../../shared/background-jobs/background-job.store';
import type {
  BackgroundJobService,
  EnqueueBackgroundJobInput,
} from '../../../shared/background-jobs/background-job.service';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import type { AuditService } from '../../../shared/audit/audit.service';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import type { AuthSessionResponseData } from '../../auth/contracts';
import type { EndPlatformSupportAccessSessionInput } from './platform-tenant.store';
import {
  PlatformTenantStore,
  type CreateOwnerInvitationInput,
  type CreateSubscriptionOverrideInput,
  type CreateTenantInput,
  type CreateTenantLifecycleEventInput,
  type CreateTenantSubscriptionInput,
  type ListTenantLifecycleEvaluationCandidatesInput,
  type ListPlatformTenantsInput,
  type PlatformPlanSummary,
  type PlatformSubscriptionSummary,
  type PlatformTenantDetailRecord,
  type PlatformTenantListRecord,
  type PlatformTenantOwnerInvitationSummary,
  type UpdateTenantStatusInput,
  type UpsertTenantSubscriptionInput,
  type CreatePlatformSupportAccessSessionInput,
  type PlatformSupportAccessSessionSummary,
  type PlatformTenantDeletionJobSummary,
  type QueueTenantDeletionJobInput,
  type ListPlatformAuditLogsInput,
  type PlatformAuditLogRecord,
} from './platform-tenant.store';
import { PLATFORM_PERMISSIONS, PlatformTenantService } from './platform-tenant.service';

const PLATFORM_ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('PlatformTenantService', () => {
  it('updates tenant subscription with previous and new values in the audit log', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      store.tenantById = createTenantRecord({
        subscription: createSubscriptionRecord({
          planId: '77777777-7777-4777-8777-777777777777',
          startDate: '2026-06-01',
          expirationDate: '2026-06-30',
        }),
      });

      const response = await service.updateTenantSubscription(
        TENANT_ID,
        {
          plan_id: PLAN_ID,
          subscription_start_date: '2026-06-27',
          subscription_expiration_date: '2026-08-27',
          reason: 'External subscription payment confirmed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response).toMatchObject({
        subscription: {
          plan_id: PLAN_ID,
          start_date: '2026-06-27',
          expiration_date: '2026-08-27',
          status_source: 'system_computed',
          updated_by_platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
        },
      });

      expect(store.updatedSubscriptions[0]).toMatchObject({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        startDate: '2026-06-27',
        expirationDate: '2026-08-27',
        updatedByPlatformAdminUserId: PLATFORM_ADMIN_USER_ID,
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.tenant_subscription.updated',
          entityType: 'tenant_subscription',
          entityId: TENANT_ID,
          beforeJson: expect.objectContaining({
            plan_id: '77777777-7777-4777-8777-777777777777',
            expiration_date: '2026-06-30',
          }),
          afterJson: expect.objectContaining({
            plan_id: PLAN_ID,
            plan_code: 'basic',
            expiration_date: '2026-08-27',
          }),
          reason: 'External subscription payment confirmed.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies a tenant read-only override with override record, lifecycle event, and audit log', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      store.tenantById = createTenantRecord({
        status: 'active',
      });

      const response = await service.applyTenantReadOnlyOverride(
        TENANT_ID,
        {
          reason: 'External billing review requires temporary read-only access.',
          expires_at: '2026-07-10T00:00:00.000Z',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.tenant).toMatchObject({
        id: TENANT_ID,
        status: 'read_only',
      });

      expect(store.updatedTenantStatuses[0]).toMatchObject({
        tenantId: TENANT_ID,
        status: 'read_only',
        updatedAt: NOW,
      });

      expect(store.subscriptionOverrides[0]).toMatchObject({
        tenantId: TENANT_ID,
        overrideType: 'read_only',
        previousValueJson: {
          status: 'active',
        },
        newValueJson: {
          status: 'read_only',
          expires_at: '2026-07-10T00:00:00.000Z',
        },
        reason: 'External billing review requires temporary read-only access.',
        expiresAt: new Date('2026-07-10T00:00:00.000Z'),
        createdByPlatformAdminUserId: PLATFORM_ADMIN_USER_ID,
      });

      expect(store.lifecycleEvents[0]).toMatchObject({
        tenantId: TENANT_ID,
        fromStatus: 'active',
        toStatus: 'read_only',
        source: 'platform_admin',
        reason: 'External billing review requires temporary read-only access.',
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.tenant_read_only_override.applied',
          entityType: 'tenant',
          entityId: TENANT_ID,
          beforeJson: {
            status: 'active',
          },
          afterJson: {
            status: 'read_only',
            expires_at: '2026-07-10T00:00:00.000Z',
          },
          metadataJson: {
            override_type: 'read_only',
          },
          reason: 'External billing review requires temporary read-only access.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires a reason before applying a tenant read-only override', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      status: 'active',
    });

    await expect(
      service.applyTenantReadOnlyOverride(
        TENANT_ID,
        {
          reason: '   ',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'reason',
          code: 'required',
        }),
      ],
    });

    expect(store.updatedTenantStatuses).toEqual([]);
    expect(store.subscriptionOverrides).toEqual([]);
  });

  it('lists platform audit logs with filters, safe metadata, and cursor pagination', async () => {
    const { service, store } = createService();

    store.auditLogRows = [
      createPlatformAuditLogRecord({
        id: '55555555-5555-4555-8555-555555555555',
        action: 'platform.tenant_export.queued',
        metadataJson: {
          tenant_status: 'active',
          access_token: 'secret-token',
          nested: {
            password_hash: 'secret-hash',
            safe_value: 'kept',
          },
        },
        createdAt: new Date('2026-06-27T03:00:00.000Z'),
      }),
      createPlatformAuditLogRecord({
        id: '66666666-6666-4666-8666-666666666666',
        action: 'platform.support_access_session.ended',
        createdAt: new Date('2026-06-27T02:00:00.000Z'),
      }),
    ];

    const response = await service.listAuditLogs(
      {
        limit: 1,
        actor: PLATFORM_ADMIN_USER_ID,
        action: 'platform.tenant_export.queued',
        tenant_id: TENANT_ID,
        from: '2026-06-27T00:00:00.000Z',
        to: '2026-06-28T00:00:00.000Z',
      },
      createPlatformSession([PLATFORM_PERMISSIONS.AUDIT_LOGS_READ]),
    );

    expect(store.auditLogInputs[0]).toMatchObject({
      limit: 2,
      platformAdminUserId: PLATFORM_ADMIN_USER_ID,
      action: 'platform.tenant_export.queued',
      tenantId: TENANT_ID,
      fromCreatedAt: new Date('2026-06-27T00:00:00.000Z'),
      toCreatedAt: new Date('2026-06-28T00:00:00.000Z'),
    });

    expect(response.audit_logs).toHaveLength(1);
    expect(response.audit_logs[0]).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
      tenant_id: TENANT_ID,
      action: 'platform.tenant_export.queued',
      entity_type: 'background_job',
      entity_id: '77777777-7777-4777-8777-777777777777',
      metadata_json: {
        tenant_status: 'active',
        access_token: '[redacted]',
        nested: {
          password_hash: '[redacted]',
          safe_value: 'kept',
        },
      },
      created_at: '2026-06-27T03:00:00.000Z',
    });
    expect(response.pagination).toMatchObject({
      limit: 1,
      has_more: true,
    });
    expect(response.pagination.next_cursor).toEqual(expect.any(String));
  });

  it('requires platform.audit_logs.read before listing platform audit logs', async () => {
    const { service, store } = createService();

    store.auditLogRows = [createPlatformAuditLogRecord()];

    await expect(
      service.listAuditLogs(
        {
          limit: 50,
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [
        {
          required_permission: PLATFORM_PERMISSIONS.AUDIT_LOGS_READ,
        },
      ],
    });

    expect(store.auditLogInputs).toEqual([]);
  });

  it('starts an audited read-only platform support access session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      store.tenantById = createTenantRecord({
        status: 'suspended',
      });

      const response = await service.startSupportAccessSession(
        TENANT_ID,
        {
          mode: 'read_only',
          reason: 'Investigate support ticket without tenant impersonation.',
          expires_at: '2026-06-28T00:00:00.000Z',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUPPORT_ACCESS]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.support_access_session).toMatchObject({
        tenant_id: TENANT_ID,
        platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
        mode: 'read_only',
        reason: 'Investigate support ticket without tenant impersonation.',
        started_at: NOW.toISOString(),
        expires_at: '2026-06-28T00:00:00.000Z',
        ended_at: null,
      });

      expect(store.supportAccessSessions[0]).toMatchObject({
        tenantId: TENANT_ID,
        platformAdminUserId: PLATFORM_ADMIN_USER_ID,
        accessMode: 'read_only',
        reason: 'Investigate support ticket without tenant impersonation.',
        startedAt: NOW,
        expiresAt: new Date('2026-06-28T00:00:00.000Z'),
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.support_access_session.started',
          entityType: 'platform_support_access_session',
          tenantId: TENANT_ID,
          actorUserId: PLATFORM_ADMIN_USER_ID,
          actorType: 'platform_admin',
          supportAccessSessionId: expect.any(String),
          afterJson: expect.objectContaining({
            tenant_id: TENANT_ID,
            platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
            mode: 'read_only',
            started_at: NOW.toISOString(),
            expires_at: '2026-06-28T00:00:00.000Z',
            ended_at: null,
          }),
          metadataJson: expect.objectContaining({
            tenant_status: 'suspended',
            tenant_business_name: 'Moto Garage',
          }),
          reason: 'Investigate support ticket without tenant impersonation.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends an active platform support access session and writes audit log', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      const supportAccessSessionId = '55555555-5555-4555-8555-555555555555';

      store.tenantById = createTenantRecord({
        status: 'read_only',
      });
      store.supportAccessSessionById = createSupportAccessSessionRecord({
        id: supportAccessSessionId,
        accessMode: 'write_allowed',
        reason: 'Investigate support ticket without tenant impersonation.',
      });

      const response = await service.endSupportAccessSession(
        supportAccessSessionId,
        {
          reason: 'Support investigation completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUPPORT_ACCESS]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.support_access_session).toMatchObject({
        id: supportAccessSessionId,
        tenant_id: TENANT_ID,
        platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
        mode: 'write_allowed',
        reason: 'Investigate support ticket without tenant impersonation.',
        ended_at: NOW.toISOString(),
      });

      expect(store.endedSupportAccessSessions[0]).toMatchObject({
        id: supportAccessSessionId,
        endedAt: NOW,
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.support_access_session.ended',
          entityType: 'platform_support_access_session',
          tenantId: TENANT_ID,
          actorUserId: PLATFORM_ADMIN_USER_ID,
          actorType: 'platform_admin',
          supportAccessSessionId,
          beforeJson: expect.objectContaining({
            tenant_id: TENANT_ID,
            platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
            mode: 'write_allowed',
            ended_at: null,
          }),
          afterJson: expect.objectContaining({
            tenant_id: TENANT_ID,
            platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
            mode: 'write_allowed',
            ended_at: NOW.toISOString(),
          }),
          metadataJson: expect.objectContaining({
            tenant_status: 'read_only',
            tenant_business_name: 'Moto Garage',
          }),
          reason: 'Support investigation completed.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks ending an already ended platform support access session', async () => {
    const { service, store } = createService();
    const supportAccessSessionId = '55555555-5555-4555-8555-555555555555';

    store.supportAccessSessionById = createSupportAccessSessionRecord({
      id: supportAccessSessionId,
      endedAt: new Date('2026-06-27T12:00:00.000Z'),
    });

    await expect(
      service.endSupportAccessSession(
        supportAccessSessionId,
        {
          reason: 'Support investigation completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUPPORT_ACCESS]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(store.endedSupportAccessSessions).toEqual([]);
  });

  it('returns not_found when ending a missing platform support access session', async () => {
    const { service, store } = createService();

    await expect(
      service.endSupportAccessSession(
        '55555555-5555-4555-8555-555555555555',
        {
          reason: 'Support investigation completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUPPORT_ACCESS]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(store.endedSupportAccessSessions).toEqual([]);
  });

  it('requires platform.support_access before ending support access session', async () => {
    const { service, store } = createService();
    const supportAccessSessionId = '55555555-5555-4555-8555-555555555555';

    store.supportAccessSessionById = createSupportAccessSessionRecord({
      id: supportAccessSessionId,
    });

    await expect(
      service.endSupportAccessSession(
        supportAccessSessionId,
        {
          reason: 'Support investigation completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [
        {
          required_permission: PLATFORM_PERMISSIONS.SUPPORT_ACCESS,
        },
      ],
    });

    expect(store.endedSupportAccessSessions).toEqual([]);
  });

  it('requires a reason before ending support access session', async () => {
    const { service, store } = createService();
    const supportAccessSessionId = '55555555-5555-4555-8555-555555555555';

    store.supportAccessSessionById = createSupportAccessSessionRecord({
      id: supportAccessSessionId,
    });

    await expect(
      service.endSupportAccessSession(
        supportAccessSessionId,
        {
          reason: '   ',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUPPORT_ACCESS]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'reason',
          code: 'required',
        }),
      ],
    });

    expect(store.endedSupportAccessSessions).toEqual([]);
  });

  it('requires a reason before updating tenant subscription', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      subscription: createSubscriptionRecord(),
    });

    await expect(
      service.updateTenantSubscription(
        TENANT_ID,
        {
          plan_id: PLAN_ID,
          subscription_start_date: '2026-06-27',
          subscription_expiration_date: '2026-08-27',
          reason: '   ',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'reason',
          code: 'required',
        }),
      ],
    });

    expect(store.updatedSubscriptions).toEqual([]);
  });

  it('denies queueTenantExport without platform.tenants.update', async () => {
    const { service, store, backgroundJobService } = createService();

    store.tenantById = createTenantRecord({
      status: 'active',
    });

    await expect(
      service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [
        {
          required_permission: PLATFORM_PERMISSIONS.TENANTS_UPDATE,
        },
      ],
    });

    expect(backgroundJobService.enqueuedJobs).toEqual([]);
  });

  it('returns not_found when queueTenantExport tenant does not exist', async () => {
    const { service, backgroundJobService } = createService();

    await expect(
      service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });

    expect(backgroundJobService.enqueuedJobs).toHaveLength(0);
  });

  it('blocks queueTenantExport when tenant status is deleted', async () => {
    const { service, store, backgroundJobService } = createService();

    store.tenantById = createTenantRecord({
      status: 'deleted',
    });

    await expect(
      service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(backgroundJobService.enqueuedJobs).toHaveLength(0);
  });

  it('blocks queueTenantExport when tenant status is pending_deletion', async () => {
    const { service, store, backgroundJobService } = createService();

    store.tenantById = createTenantRecord({
      status: 'pending_deletion',
    });

    await expect(
      service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(backgroundJobService.enqueuedJobs).toHaveLength(0);
  });

  it('queues a tenant_export.generate background job for a valid tenant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, backgroundJobService } = createService();

      store.tenantById = createTenantRecord({
        status: 'active',
      });

      const response = await service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.export_job).toMatchObject({
        tenant_id: TENANT_ID,
        job_type: 'tenant_export.generate',
        status: 'queued',
        requested_at: NOW.toISOString(),
        run_after: NOW.toISOString(),
        include_attachments: false,
      });

      expect(backgroundJobService.enqueuedJobs).toHaveLength(1);
      expect(backgroundJobService.enqueuedJobs[0]).toMatchObject({
        tenantId: TENANT_ID,
        jobType: 'tenant_export.generate',
        runAfter: NOW,
        maxAttempts: 3,
        correlationId: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores tenant export request details in payload_json', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, backgroundJobService } = createService();

      store.tenantById = createTenantRecord({
        status: 'active',
      });

      await service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(backgroundJobService.enqueuedJobs[0]?.payloadJson).toEqual({
        tenant_id: TENANT_ID,
        requested_by_platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
        reason: 'Compliance export request.',
        include_attachments: false,
        requested_at: NOW.toISOString(),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes audit log action platform.tenant_export.queued', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      store.tenantById = createTenantRecord({
        status: 'active',
      });

      const response = await service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorUserId: PLATFORM_ADMIN_USER_ID,
          actorType: 'platform_admin',
          action: 'platform.tenant_export.queued',
          entityType: 'background_job',
          entityId: response.export_job.id,
          afterJson: expect.objectContaining({
            tenant_id: TENANT_ID,
            job_id: response.export_job.id,
            job_type: 'tenant_export.generate',
            status: 'queued',
            include_attachments: false,
            run_after: NOW.toISOString(),
            requested_at: NOW.toISOString(),
          }),
          metadataJson: {
            tenant_status: 'active',
            tenant_business_name: 'Moto Garage',
          },
          reason: 'Compliance export request.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies queueTenantDeletionJob without platform.tenants.update', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      status: 'pending_deletion',
      deletionScheduledFor: new Date('2026-08-03T00:00:00.000Z'),
    });

    await expect(
      service.queueTenantDeletionJob(
        TENANT_ID,
        {
          reason: 'Retention window completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.FORBIDDEN,
      details: [
        {
          required_permission: PLATFORM_PERMISSIONS.TENANTS_UPDATE,
        },
      ],
    });

    expect(store.queuedTenantDeletionJobs).toEqual([]);
  });

  it('blocks queueTenantDeletionJob for non-pending-deletion tenants', async () => {
    const blockedStatuses = ['active', 'grace_period', 'read_only', 'suspended'] as const;

    for (const status of blockedStatuses) {
      const { service, store } = createService();

      store.tenantById = createTenantRecord({
        status,
      });

      await expect(
        service.queueTenantDeletionJob(
          TENANT_ID,
          {
            reason: 'Retention window completed.',
          },
          createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
          {
            ipAddress: null,
            userAgent: null,
          },
        ),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      });

      expect(store.queuedTenantDeletionJobs).toEqual([]);
    }
  });

  it('blocks queueTenantDeletionJob when tenant status is deleted', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      status: 'deleted',
    });

    await expect(
      service.queueTenantDeletionJob(
        TENANT_ID,
        {
          reason: 'Retention window completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(store.queuedTenantDeletionJobs).toEqual([]);
  });

  it('blocks queueTenantDeletionJob when pending_deletion tenant has no scheduled deletion date', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      status: 'pending_deletion',
      deletionScheduledFor: null,
    });

    await expect(
      service.queueTenantDeletionJob(
        TENANT_ID,
        {
          reason: 'Retention window completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
    });

    expect(store.queuedTenantDeletionJobs).toEqual([]);
  });

  it('blocks duplicate active tenant deletion jobs', async () => {
    const { service, store } = createService();

    store.tenantById = createTenantRecord({
      status: 'pending_deletion',
      deletionScheduledFor: new Date('2026-08-03T00:00:00.000Z'),
    });
    store.activeTenantDeletionJob = createTenantDeletionJobRecord({
      status: 'queued',
    });

    await expect(
      service.queueTenantDeletionJob(
        TENANT_ID,
        {
          reason: 'Retention window completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });

    expect(store.queuedTenantDeletionJobs).toEqual([]);
  });

  it('queues tenant deletion job for eligible pending_deletion tenant and writes audit log', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      const scheduledFor = new Date('2026-08-03T00:00:00.000Z');

      store.tenantById = createTenantRecord({
        status: 'pending_deletion',
        deletionScheduledFor: scheduledFor,
      });

      const response = await service.queueTenantDeletionJob(
        TENANT_ID,
        {
          reason: 'Retention window completed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.deletion_job).toMatchObject({
        tenant_id: TENANT_ID,
        status: 'queued',
        scheduled_for: scheduledFor.toISOString(),
        created_at: NOW.toISOString(),
      });

      expect(store.queuedTenantDeletionJobs).toHaveLength(1);
      expect(store.queuedTenantDeletionJobs[0]).toMatchObject({
        tenantId: TENANT_ID,
        scheduledFor,
        status: 'queued',
        createdAt: NOW,
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorUserId: PLATFORM_ADMIN_USER_ID,
          actorType: 'platform_admin',
          action: 'platform.tenant_deletion.queued',
          entityType: 'tenant_deletion_job',
          entityId: response.deletion_job.id,
          afterJson: expect.objectContaining({
            tenant_id: TENANT_ID,
            deletion_job_id: response.deletion_job.id,
            status: 'queued',
            scheduled_for: scheduledFor.toISOString(),
            queued_at: NOW.toISOString(),
          }),
          metadataJson: {
            tenant_status: 'pending_deletion',
            tenant_business_name: 'Moto Garage',
          },
          reason: 'Retention window completed.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves include_attachments true in the response and queued job payload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, backgroundJobService } = createService();

      store.tenantById = createTenantRecord({
        status: 'active',
      });

      const response = await service.queueTenantExport(
        TENANT_ID,
        {
          reason: 'Compliance export request with attachments.',
          include_attachments: true,
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_UPDATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response.export_job).toMatchObject({
        tenant_id: TENANT_ID,
        job_type: 'tenant_export.generate',
        status: 'queued',
        include_attachments: true,
      });

      expect(backgroundJobService.enqueuedJobs[0]?.payloadJson).toMatchObject({
        tenant_id: TENANT_ID,
        requested_by_platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
        reason: 'Compliance export request with attachments.',
        include_attachments: true,
        requested_at: NOW.toISOString(),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects subscription updates for missing tenants', async () => {
    const { service } = createService();

    await expect(
      service.updateTenantSubscription(
        TENANT_ID,
        {
          plan_id: PLAN_ID,
          subscription_start_date: '2026-06-27',
          subscription_expiration_date: '2026-08-27',
          reason: 'External subscription payment confirmed.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.SUBSCRIPTIONS_UPDATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
    });
  });

  it('requires a verified platform admin with the requested platform permission', () => {
    const { service } = createService();

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          {
            ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
            user: {
              ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]).user,
              user_type: 'tenant_user',
            },
          },
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          {
            ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
            user: {
              ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]).user,
              email_verified: false,
            },
          },
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          createPlatformSession([]),
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );
  });

  it('lists tenants with API-safe pagination metadata', async () => {
    const { service, store } = createService();
    store.listRows = [
      createTenantRecord({
        id: '55555555-5555-4555-8555-555555555555',
        businessName: 'Moto Garage',
        createdAt: new Date('2026-06-27T03:00:00.000Z'),
      }),
      createTenantRecord({
        id: '66666666-6666-4666-8666-666666666666',
        businessName: 'Second Garage',
        createdAt: new Date('2026-06-27T02:00:00.000Z'),
      }),
    ];

    const response = await service.listTenants(
      {
        limit: 1,
        q: ' garage ',
      },
      createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
    );

    expect(store.listInputs[0]).toMatchObject({
      limit: 2,
      search: 'garage',
    });
    expect(response.tenants).toHaveLength(1);
    expect(response.tenants[0]).toMatchObject({
      business_name: 'Moto Garage',
      status: 'pending_setup',
    });
    expect(response.pagination).toMatchObject({
      limit: 1,
      has_more: true,
    });
    expect(response.pagination.next_cursor).toEqual(expect.any(String));
  });

  it('creates a pending setup tenant with subscription baseline, owner invitation, lifecycle event, and audit logs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createTenant(
        createTenantRequest(),
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response).toMatchObject({
        tenant: {
          business_name: 'Moto Garage',
          status: 'pending_setup',
        },
        subscription: {
          plan_id: PLAN_ID,
          start_date: '2026-06-27',
          expiration_date: '2026-07-27',
          status_source: 'system_computed',
        },
        owner_invitation_sent: true,
      });

      expect(store.createdTenants[0]).toMatchObject({
        businessName: 'Moto Garage',
        normalizedBusinessName: 'moto garage',
        shopEmail: 'Owner@MotoGarage.test',
        normalizedShopEmail: 'owner@motogarage.test',
        status: 'pending_setup',
      });
      expect(store.createdSubscriptions[0]).toMatchObject({
        planId: PLAN_ID,
        startDate: '2026-06-27',
        expirationDate: '2026-07-27',
        updatedByPlatformAdminUserId: PLATFORM_ADMIN_USER_ID,
      });
      expect(store.createdInvitations[0]).toMatchObject({
        email: 'owner@motogarage.test',
        normalizedEmail: 'owner@motogarage.test',
        status: 'pending',
        assignedRoleConfigJson: {
          role_type: 'shop_owner',
          protected_owner_capabilities: true,
        },
      });
      expect(store.lifecycleEvents[0]).toMatchObject({
        fromStatus: null,
        toStatus: 'pending_setup',
        source: 'platform_admin',
      });
      expect(auditService.record).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a duplicate platform-created tenant only with explicit approval and reason', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();
      store.duplicate = createTenantRecord({
        id: '99999999-9999-4999-8999-999999999999',
        businessName: 'Moto Garage',
      });

      const response = await service.createTenant(
        {
          ...createTenantRequest(),
          approve_duplicate: true,
          duplicate_approval_reason: 'Separate legal entity using the same shared admin email.',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response).toMatchObject({
        tenant: {
          business_name: 'Moto Garage',
          status: 'pending_setup',
        },
        owner_invitation_sent: true,
      });

      expect(store.createdTenants[0]).toMatchObject({
        businessName: 'Moto Garage',
        normalizedBusinessName: 'moto garage',
        normalizedShopEmail: 'owner@motogarage.test',
        duplicateApprovedAt: NOW,
        duplicateApprovedByPlatformAdminUserId: PLATFORM_ADMIN_USER_ID,
        duplicateApprovalReason: 'Separate legal entity using the same shared admin email.',
      });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.tenant_duplicate_approval.applied',
          entityType: 'tenant',
          metadataJson: expect.objectContaining({
            duplicate_approved_by_platform_admin_user_id: PLATFORM_ADMIN_USER_ID,
            duplicate_approval_reason: 'Separate legal entity using the same shared admin email.',
          }),
          reason: 'Separate legal entity using the same shared admin email.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks duplicate approval when the approval reason is blank', async () => {
    const { service, store } = createService();
    store.duplicate = createTenantRecord({
      id: '99999999-9999-4999-8999-999999999999',
      businessName: 'Moto Garage',
    });

    await expect(
      service.createTenant(
        {
          ...createTenantRequest(),
          approve_duplicate: true,
          duplicate_approval_reason: '   ',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'duplicate_approval_reason',
          code: 'required',
        }),
      ],
    });

    expect(store.createdTenants).toEqual([]);
  });

  it('requires an active subscription plan', async () => {
    const { service, store } = createService();
    store.plan = null;

    await expect(
      service.createTenant(
        createTenantRequest(),
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'plan_id',
          code: 'active_plan_required',
        }),
      ],
    });
  });

  it('rejects an expiration date before the start date', async () => {
    const { service } = createService();

    await expect(
      service.createTenant(
        {
          ...createTenantRequest(),
          subscription_expiration_date: '2026-06-26',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'subscription_expiration_date',
          code: 'date_before_start',
        }),
      ],
    });
  });
});

function createService(): {
  readonly service: PlatformTenantService;
  readonly store: FakePlatformTenantStore;
  readonly backgroundJobService: FakeBackgroundJobService;
  readonly auditService: AuditService;
} {
  const store = new FakePlatformTenantStore();
  const backgroundJobService = new FakeBackgroundJobService();
  const auditService = {
    record: vi.fn(
      async (input: unknown): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: null,
        actorUserId: null,
        actorType: 'platform_admin',
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
    service: new PlatformTenantService(
      store,
      backgroundJobService as unknown as BackgroundJobService,
      new FakeTransactionRunner(),
      auditService,
      new SecureTokenService(),
      new TokenHashingService(),
    ),
    store,
    backgroundJobService,
    auditService,
  };
}

function createTenantRequest() {
  return {
    business_name: 'Moto Garage',
    shop_email: 'Owner@MotoGarage.test',
    plan_id: PLAN_ID,
    subscription_start_date: '2026-06-27',
    subscription_expiration_date: '2026-07-27',
    owner: {
      full_name: 'Juan Dela Cruz',
      email: 'owner@motogarage.test',
      send_invitation: true as const,
    },
    duplicate_approval_reason: null,
  };
}

function createPlatformSession(permissions: readonly string[]): AuthSessionResponseData {
  return {
    user: {
      id: PLATFORM_ADMIN_USER_ID,
      user_type: 'platform_admin',
      full_name: 'Platform Admin',
      email: 'admin@garageos.test',
      email_verified: true,
      status: 'active',
    },
    tenant: null,
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: false,
    effective_plan: null,
    subscription: null,
    access: {
      can_access_operational_modules: false,
      read_only: false,
    },
  };
}

function createPlatformAuditLogRecord(
  overrides: Partial<PlatformAuditLogRecord> = {},
): PlatformAuditLogRecord {
  return {
    id: overrides.id ?? '55555555-5555-4555-8555-555555555555',
    platformAdminUserId: overrides.platformAdminUserId ?? PLATFORM_ADMIN_USER_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    action: overrides.action ?? 'platform.tenant_export.queued',
    entityType: overrides.entityType ?? 'background_job',
    entityId: overrides.entityId ?? '77777777-7777-4777-8777-777777777777',
    metadataJson: overrides.metadataJson ?? {
      tenant_status: 'active',
    },
    ipAddress: overrides.ipAddress ?? '127.0.0.1',
    userAgent: overrides.userAgent ?? 'vitest',
    createdAt: overrides.createdAt ?? NOW,
  };
}

function createTenantRecord(
  overrides: Partial<PlatformTenantDetailRecord> = {},
): PlatformTenantDetailRecord {
  const createdAt = overrides.createdAt ?? NOW;

  return {
    id: overrides.id ?? TENANT_ID,
    businessName: overrides.businessName ?? 'Moto Garage',
    shopEmail: overrides.shopEmail ?? 'owner@motogarage.test',
    status: overrides.status ?? 'pending_setup',
    timezone: overrides.timezone ?? 'Asia/Manila',
    country: overrides.country ?? 'PH',
    currency: overrides.currency ?? 'PHP',
    duplicateApprovedAt: overrides.duplicateApprovedAt ?? null,
    duplicateApprovedByPlatformAdminUserId:
      overrides.duplicateApprovedByPlatformAdminUserId ?? null,
    duplicateApprovalReason: overrides.duplicateApprovalReason ?? null,
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    lockVersion: overrides.lockVersion ?? 0,
    plan: overrides.plan ?? null,
    subscription: overrides.subscription ?? null,
    owner: overrides.owner ?? null,
    ownerInvitation: overrides.ownerInvitation ?? null,
    onboardingCompletedAt: overrides.onboardingCompletedAt ?? null,
    deletionScheduledFor: overrides.deletionScheduledFor ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function createSubscriptionRecord(
  overrides: Partial<PlatformSubscriptionSummary> = {},
): PlatformSubscriptionSummary {
  return {
    planId: overrides.planId ?? PLAN_ID,
    startDate: overrides.startDate ?? '2026-06-27',
    expirationDate: overrides.expirationDate ?? '2026-07-27',
    statusSource: overrides.statusSource ?? 'system_computed',
    lastRenewalAt: overrides.lastRenewalAt ?? null,
    updatedByPlatformAdminUserId: overrides.updatedByPlatformAdminUserId ?? PLATFORM_ADMIN_USER_ID,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function createTenantDeletionJobRecord(
  overrides: Partial<PlatformTenantDeletionJobSummary> = {},
): PlatformTenantDeletionJobSummary {
  return {
    id: overrides.id ?? '88888888-8888-4888-8888-888888888888',
    tenantId: overrides.tenantId ?? TENANT_ID,
    scheduledFor: overrides.scheduledFor ?? new Date('2026-08-03T00:00:00.000Z'),
    status: overrides.status ?? 'queued',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    failureReason: overrides.failureReason ?? null,
    attemptCount: overrides.attemptCount ?? 0,
    createdAt: overrides.createdAt ?? NOW,
  };
}

function createSupportAccessSessionRecord(
  overrides: Partial<PlatformSupportAccessSessionSummary> = {},
): PlatformSupportAccessSessionSummary {
  return {
    id: overrides.id ?? '55555555-5555-4555-8555-555555555555',
    tenantId: overrides.tenantId ?? TENANT_ID,
    platformAdminUserId: overrides.platformAdminUserId ?? PLATFORM_ADMIN_USER_ID,
    accessMode: overrides.accessMode ?? 'read_only',
    reason: overrides.reason ?? 'Investigate support ticket without tenant impersonation.',
    startedAt: overrides.startedAt ?? NOW,
    expiresAt: overrides.expiresAt ?? new Date('2026-06-28T00:00:00.000Z'),
    endedAt: overrides.endedAt ?? null,
  };
}

function expectForbidden(action: () => unknown, requiredPermission: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.FORBIDDEN);
    expect((error as GarageOsApiException).details).toEqual([
      {
        required_permission: requiredPermission,
      },
    ]);
    return;
  }

  throw new Error('Expected forbidden error.');
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

class FakeBackgroundJobService {
  readonly enqueuedJobs: EnqueueBackgroundJobInput[] = [];

  async enqueueInTransaction(input: EnqueueBackgroundJobInput): Promise<BackgroundJobRecord> {
    this.enqueuedJobs.push(input);

    return createBackgroundJobRecord({
      tenantId: input.tenantId ?? null,
      jobType: input.jobType,
      payloadJson: input.payloadJson ?? {},
      runAfter: input.runAfter ?? NOW,
      maxAttempts: input.maxAttempts ?? 3,
      correlationId: input.correlationId ?? null,
      createdAt: input.now ?? input.runAfter ?? NOW,
    });
  }
}

function createBackgroundJobRecord(
  overrides: Partial<BackgroundJobRecord> = {},
): BackgroundJobRecord {
  const createdAt = overrides.createdAt ?? NOW;

  return {
    id: overrides.id ?? '99999999-9999-4999-8999-999999999999',
    tenantId: overrides.tenantId ?? TENANT_ID,
    jobType: overrides.jobType ?? 'tenant_export.generate',
    status: overrides.status ?? 'queued',
    payloadJson: overrides.payloadJson ?? {},
    runAfter: overrides.runAfter ?? NOW,
    attemptCount: overrides.attemptCount ?? 0,
    maxAttempts: overrides.maxAttempts ?? 3,
    lockedBy: overrides.lockedBy ?? null,
    lockedUntil: overrides.lockedUntil ?? null,
    createdAt,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    failedAt: overrides.failedAt ?? null,
    lastError: overrides.lastError ?? null,
    correlationId: overrides.correlationId ?? null,
  };
}

class FakePlatformTenantStore extends PlatformTenantStore {
  listRows: PlatformTenantListRecord[] = [];
  plan: PlatformPlanSummary | null = {
    id: PLAN_ID,
    code: 'basic',
    name: 'Basic',
    status: 'active',
  };
  duplicate: PlatformTenantDetailRecord | null = null;
  tenantById: PlatformTenantDetailRecord | null = null;
  supportAccessSessionById: PlatformSupportAccessSessionSummary | null = null;
  activeTenantDeletionJob: PlatformTenantDeletionJobSummary | null = null;
  auditLogRows: PlatformAuditLogRecord[] = [];
  readonly auditLogInputs: ListPlatformAuditLogsInput[] = [];
  readonly queuedTenantDeletionJobs: QueueTenantDeletionJobInput[] = [];
  readonly listInputs: ListPlatformTenantsInput[] = [];
  readonly createdTenants: CreateTenantInput[] = [];
  readonly createdSubscriptions: CreateTenantSubscriptionInput[] = [];
  readonly updatedSubscriptions: UpsertTenantSubscriptionInput[] = [];
  readonly updatedTenantStatuses: UpdateTenantStatusInput[] = [];
  readonly subscriptionOverrides: CreateSubscriptionOverrideInput[] = [];
  readonly supportAccessSessions: CreatePlatformSupportAccessSessionInput[] = [];
  readonly endedSupportAccessSessions: EndPlatformSupportAccessSessionInput[] = [];
  readonly createdInvitations: CreateOwnerInvitationInput[] = [];
  readonly lifecycleEvents: CreateTenantLifecycleEventInput[] = [];

  async listPlatformAuditLogs(
    input: ListPlatformAuditLogsInput,
  ): Promise<readonly PlatformAuditLogRecord[]> {
    this.auditLogInputs.push(input);

    return this.auditLogRows;
  }

  async listTenants(input: ListPlatformTenantsInput): Promise<readonly PlatformTenantListRecord[]> {
    this.listInputs.push(input);

    return this.listRows;
  }

  async findTenantById(): Promise<PlatformTenantDetailRecord | null> {
    return this.tenantById;
  }

  async listTenantLifecycleEvaluationCandidates(
    _input: ListTenantLifecycleEvaluationCandidatesInput,
  ): Promise<readonly PlatformTenantDetailRecord[]> {
    return [];
  }

  async findActivePlanById(): Promise<PlatformPlanSummary | null> {
    return this.plan;
  }

  async findNonDeletedTenantByBusinessEmail(): Promise<PlatformTenantDetailRecord | null> {
    return this.duplicate;
  }

  async createTenant(input: CreateTenantInput): Promise<PlatformTenantDetailRecord> {
    this.createdTenants.push(input);

    return createTenantRecord({
      id: input.id,
      businessName: input.businessName,
      shopEmail: input.shopEmail,
      status: input.status,
      duplicateApprovedAt: input.duplicateApprovedAt,
      duplicateApprovedByPlatformAdminUserId: input.duplicateApprovedByPlatformAdminUserId,
      duplicateApprovalReason: input.duplicateApprovalReason,
      createdAt: input.createdAt,
    });
  }

  async createTenantSubscription(
    input: CreateTenantSubscriptionInput,
  ): Promise<PlatformSubscriptionSummary> {
    this.createdSubscriptions.push(input);

    return createSubscriptionRecord({
      planId: input.planId,
      startDate: input.startDate,
      expirationDate: input.expirationDate,
      updatedByPlatformAdminUserId: input.updatedByPlatformAdminUserId,
      updatedAt: input.updatedAt,
    });
  }

  async upsertTenantSubscription(
    input: UpsertTenantSubscriptionInput,
  ): Promise<PlatformSubscriptionSummary> {
    this.updatedSubscriptions.push(input);

    return createSubscriptionRecord({
      planId: input.planId,
      startDate: input.startDate,
      expirationDate: input.expirationDate,
      updatedByPlatformAdminUserId: input.updatedByPlatformAdminUserId,
      updatedAt: input.updatedAt,
    });
  }

  async updateTenantStatus(input: UpdateTenantStatusInput): Promise<PlatformTenantDetailRecord> {
    this.updatedTenantStatuses.push(input);

    const currentTenant = this.tenantById ?? createTenantRecord();

    this.tenantById = createTenantRecord({
      ...currentTenant,
      status: input.status,
      updatedAt: input.updatedAt,
      lockVersion: currentTenant.lockVersion + 1,
    });

    return this.tenantById;
  }

  async createSubscriptionOverride(input: CreateSubscriptionOverrideInput): Promise<void> {
    this.subscriptionOverrides.push(input);
  }

  async createPlatformSupportAccessSession(
    input: CreatePlatformSupportAccessSessionInput,
  ): Promise<PlatformSupportAccessSessionSummary> {
    this.supportAccessSessions.push(input);

    return {
      id: input.id,
      tenantId: input.tenantId,
      platformAdminUserId: input.platformAdminUserId,
      accessMode: input.accessMode,
      reason: input.reason,
      startedAt: input.startedAt,
      expiresAt: input.expiresAt,
      endedAt: null,
    };
  }

  async findPlatformSupportAccessSessionById(): Promise<PlatformSupportAccessSessionSummary | null> {
    return this.supportAccessSessionById;
  }

  async endPlatformSupportAccessSession(
    input: EndPlatformSupportAccessSessionInput,
  ): Promise<PlatformSupportAccessSessionSummary> {
    this.endedSupportAccessSessions.push(input);

    const currentSession = this.supportAccessSessionById ?? createSupportAccessSessionRecord();

    this.supportAccessSessionById = {
      ...currentSession,
      endedAt: input.endedAt,
    };

    return this.supportAccessSessionById;
  }

  async createOwnerInvitation(
    input: CreateOwnerInvitationInput,
  ): Promise<PlatformTenantOwnerInvitationSummary> {
    this.createdInvitations.push(input);

    return {
      email: input.email,
      status: input.status,
      expiresAt: input.expiresAt,
    };
  }

  async createTenantLifecycleEvent(input: CreateTenantLifecycleEventInput): Promise<void> {
    this.lifecycleEvents.push(input);
  }

  async findActiveTenantDeletionJobByTenantId(): Promise<PlatformTenantDeletionJobSummary | null> {
    return this.activeTenantDeletionJob;
  }

  async queueTenantDeletionJob(
    input: QueueTenantDeletionJobInput,
  ): Promise<PlatformTenantDeletionJobSummary> {
    this.queuedTenantDeletionJobs.push(input);

    return createTenantDeletionJobRecord({
      id: input.id,
      tenantId: input.tenantId,
      scheduledFor: input.scheduledFor,
      status: input.status,
      createdAt: input.createdAt,
    });
  }
}
