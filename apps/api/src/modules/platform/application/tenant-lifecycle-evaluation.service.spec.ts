import { describe, expect, it } from 'vitest';

import type {
  PlatformSubscriptionSummary,
  PlatformTenantDetailRecord,
} from './platform-tenant.store';
import { TenantLifecycleEvaluationService } from './tenant-lifecycle-evaluation.service';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';

describe('TenantLifecycleEvaluationService', () => {
  it('prepares a system status change, lifecycle event, and audit log when computed status differs', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      status: 'active',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'active',
      subscriptionStatusSource: 'system_computed',
      computedLifecycleStatus: 'read_only',
      targetStatus: 'read_only',
      shouldUpdateTenantStatus: true,
      skippedReason: null,
    });

    expect(result.statusChange).toMatchObject({
      tenantId: TENANT_ID,
      fromStatus: 'active',
      toStatus: 'read_only',
      computedLifecycleStatus: 'read_only',
      reason: 'subscription_lifecycle_evaluation',
    });

    expect(result.lifecycleEventInput).toMatchObject({
      tenantId: TENANT_ID,
      fromStatus: 'active',
      toStatus: 'read_only',
      source: 'system',
      reason: 'subscription_lifecycle_evaluation',
      effectiveAt: new Date('2026-06-15T16:00:00.000Z'),
      createdAt: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result.lifecycleEventInput?.id).toBe('');

    expect(result.systemAuditLogInput).toMatchObject({
      tenantId: TENANT_ID,
      actorUserId: null,
      actorType: 'system',
      action: 'system.tenant_lifecycle.status_changed',
      entityType: 'tenant',
      entityId: TENANT_ID,
      beforeJson: {
        status: 'active',
      },
      afterJson: {
        status: 'read_only',
      },
      metadataJson: {
        computed_lifecycle_status: 'read_only',
        target_status: 'read_only',
        subscription_status_source: 'system_computed',
        subscription_expiration_date: '2026-06-01',
        tenant_timezone: 'Asia/Manila',
        evaluation_timestamp: '2026-06-15T16:00:00.000Z',
        deletion_execution_eligible: false,
      },
      reason: 'subscription_lifecycle_evaluation',
      createdAt: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result.deletionExecution).toBeNull();
  });

  it('does not recommend a tenant status update when platform_override is active', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      status: 'suspended',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'platform_override',
      }),
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'suspended',
      subscriptionStatusSource: 'platform_override',
      computedLifecycleStatus: 'read_only',
      targetStatus: 'suspended',
      shouldUpdateTenantStatus: false,
      skippedReason: 'platform_override_active',
      statusChange: null,
      lifecycleEventInput: null,
      systemAuditLogInput: null,
      deletionExecution: null,
    });
  });

  it('does not activate pending_setup tenants during scheduled lifecycle evaluation', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      status: 'pending_setup',
      onboardingCompletedAt: null,
      subscription: createSubscriptionRecord({
        expirationDate: '2026-07-01',
        statusSource: 'system_computed',
      }),
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'pending_setup',
      subscriptionStatusSource: 'system_computed',
      computedLifecycleStatus: 'active',
      targetStatus: 'pending_setup',
      shouldUpdateTenantStatus: false,
      skippedReason: 'pending_setup_not_lifecycle_managed',
      statusChange: null,
      lifecycleEventInput: null,
      systemAuditLogInput: null,
      deletionExecution: null,
    });
  });

  it('maps Day 68 or later to pending_deletion status change and deletion-execution eligibility without marking tenant deleted', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      status: 'suspended',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-08-07T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'suspended',
      subscriptionStatusSource: 'system_computed',
      computedLifecycleStatus: 'deleted',
      targetStatus: 'pending_deletion',
      shouldUpdateTenantStatus: true,
      skippedReason: null,
    });

    expect(result.statusChange).toMatchObject({
      fromStatus: 'suspended',
      toStatus: 'pending_deletion',
      computedLifecycleStatus: 'deleted',
    });

    expect(result.lifecycleEventInput).toMatchObject({
      tenantId: TENANT_ID,
      fromStatus: 'suspended',
      toStatus: 'pending_deletion',
      source: 'system',
      reason: 'subscription_lifecycle_evaluation',
    });

    expect(result.systemAuditLogInput).toMatchObject({
      actorType: 'system',
      action: 'system.tenant_lifecycle.status_changed',
      beforeJson: {
        status: 'suspended',
      },
      afterJson: {
        status: 'pending_deletion',
      },
      metadataJson: {
        computed_lifecycle_status: 'deleted',
        target_status: 'pending_deletion',
        deletion_execution_eligible: true,
      },
    });

    expect(result.deletionExecution).toEqual({
      eligible: true,
      reason: 'lifecycle_day_68_or_later',
      computedLifecycleStatus: 'deleted',
      currentStatus: 'suspended',
    });
  });

  it('does not recommend duplicate status changes when tenant already matches the lifecycle status', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      status: 'grace_period',
      subscription: createSubscriptionRecord({
        expirationDate: '2026-06-01',
        statusSource: 'system_computed',
      }),
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-06-01T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'grace_period',
      subscriptionStatusSource: 'system_computed',
      computedLifecycleStatus: 'grace_period',
      targetStatus: 'grace_period',
      shouldUpdateTenantStatus: false,
      skippedReason: 'status_already_current',
      statusChange: null,
      lifecycleEventInput: null,
      systemAuditLogInput: null,
      deletionExecution: null,
    });
  });

  it('does not recommend lifecycle changes when subscription data is missing', () => {
    const service = new TenantLifecycleEvaluationService();

    const tenant = createTenantRecord({
      subscription: null,
    });

    const result = service.evaluateTenantLifecycle({
      tenant,
      now: new Date('2026-06-15T16:00:00.000Z'),
    });

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      currentStatus: 'active',
      subscriptionStatusSource: null,
      computedLifecycleStatus: null,
      targetStatus: null,
      shouldUpdateTenantStatus: false,
      skippedReason: 'missing_subscription',
      statusChange: null,
      lifecycleEventInput: null,
      systemAuditLogInput: null,
      deletionExecution: null,
    });
  });
});

function createSubscriptionRecord(
  overrides: Partial<PlatformSubscriptionSummary> = {},
): PlatformSubscriptionSummary {
  return {
    planId: PLAN_ID,
    startDate: '2026-05-01',
    expirationDate: '2026-06-01',
    statusSource: 'system_computed',
    lastRenewalAt: null,
    updatedByPlatformAdminUserId: null,
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createTenantRecord(
  overrides: Partial<PlatformTenantDetailRecord> = {},
): PlatformTenantDetailRecord {
  return {
    id: TENANT_ID,
    businessName: 'GarageOS Test Shop',
    shopEmail: 'owner@example.com',
    status: 'active',
    timezone: 'Asia/Manila',
    country: 'PH',
    currency: 'PHP',
    duplicateApprovedAt: null,
    duplicateApprovedByPlatformAdminUserId: null,
    duplicateApprovalReason: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    lockVersion: 0,
    plan: {
      id: PLAN_ID,
      code: 'basic',
      name: 'Basic',
      status: 'active',
    },
    subscription: createSubscriptionRecord(),
    owner: null,
    ownerInvitation: null,
    onboardingCompletedAt: new Date('2026-05-01T00:00:00.000Z'),
    deletionScheduledFor: null,
    deletedAt: null,
    ...overrides,
  };
}
