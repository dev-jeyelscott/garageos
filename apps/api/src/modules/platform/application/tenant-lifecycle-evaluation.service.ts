import { Injectable } from '@nestjs/common';

import { AUDIT_ACTOR_TYPES, type RecordAuditLogInput } from '../../../shared/audit/audit.service';
import { calculateSubscriptionLifecycleStatus } from '../domain/subscription-lifecycle-calculator';
import type {
  CreateTenantLifecycleEventInput,
  PlatformTenantDetailRecord,
  PlatformTenantStatus,
} from './platform-tenant.store';

const SYSTEM_LIFECYCLE_EVALUATION_REASON = 'subscription_lifecycle_evaluation';
const SYSTEM_LIFECYCLE_STATUS_CHANGED_ACTION = 'system.tenant_lifecycle.status_changed';

const PLATFORM_TENANT_STATUSES = [
  'pending_setup',
  'active',
  'grace_period',
  'read_only',
  'suspended',
  'pending_deletion',
  'deleted',
] as const satisfies readonly PlatformTenantStatus[];

export type TenantLifecycleEvaluationSkipReason =
  | 'missing_subscription'
  | 'pending_setup_not_lifecycle_managed'
  | 'deleted_tenant_not_lifecycle_managed'
  | 'platform_override_active'
  | 'status_already_current';

export interface EvaluateTenantLifecycleInput {
  readonly tenant: PlatformTenantDetailRecord;
  readonly now?: Date;
}

export interface TenantLifecycleStatusChange {
  readonly tenantId: string;
  readonly fromStatus: PlatformTenantStatus;
  readonly toStatus: PlatformTenantStatus;
  readonly computedLifecycleStatus: PlatformTenantStatus;
  readonly reason: string;
  readonly effectiveAt: Date;
}

export interface TenantLifecycleDeletionExecutionEvaluation {
  readonly eligible: boolean;
  readonly reason: 'lifecycle_day_68_or_later';
  readonly computedLifecycleStatus: 'deleted';
  readonly currentStatus: PlatformTenantStatus;
}

export interface TenantLifecycleEvaluationResult {
  readonly tenantId: string;
  readonly currentStatus: PlatformTenantStatus;
  readonly subscriptionStatusSource: string | null;
  readonly computedLifecycleStatus: PlatformTenantStatus | null;
  readonly targetStatus: PlatformTenantStatus | null;
  readonly shouldUpdateTenantStatus: boolean;
  readonly skippedReason: TenantLifecycleEvaluationSkipReason | null;
  readonly statusChange: TenantLifecycleStatusChange | null;
  readonly lifecycleEventInput: CreateTenantLifecycleEventInput | null;
  readonly systemAuditLogInput: RecordAuditLogInput | null;
  readonly deletionExecution: TenantLifecycleDeletionExecutionEvaluation | null;
}

@Injectable()
export class TenantLifecycleEvaluationService {
  evaluateTenantLifecycle(input: EvaluateTenantLifecycleInput): TenantLifecycleEvaluationResult {
    const now = input.now ?? new Date();
    const tenant = input.tenant;
    const subscription = tenant.subscription;

    if (subscription === null) {
      return createSkippedEvaluation({
        tenant,
        computedLifecycleStatus: null,
        targetStatus: null,
        subscriptionStatusSource: null,
        skippedReason: 'missing_subscription',
      });
    }

    const computedLifecycleStatus = normalizeCalculatedLifecycleStatus(
      calculateSubscriptionLifecycleStatus({
        expirationDate: subscription.expirationDate,
        tenantTimezone: tenant.timezone,
        now,
      }),
    );

    const deletionExecution: TenantLifecycleDeletionExecutionEvaluation | null =
      computedLifecycleStatus === 'deleted'
        ? {
            eligible: true,
            reason: 'lifecycle_day_68_or_later',
            computedLifecycleStatus,
            currentStatus: tenant.status,
          }
        : null;

    if (tenant.status === 'pending_setup') {
      return createSkippedEvaluation({
        tenant,
        computedLifecycleStatus,
        targetStatus: tenant.status,
        subscriptionStatusSource: subscription.statusSource,
        skippedReason: 'pending_setup_not_lifecycle_managed',
        deletionExecution,
      });
    }

    if (tenant.status === 'deleted') {
      return createSkippedEvaluation({
        tenant,
        computedLifecycleStatus,
        targetStatus: tenant.status,
        subscriptionStatusSource: subscription.statusSource,
        skippedReason: 'deleted_tenant_not_lifecycle_managed',
        deletionExecution,
      });
    }

    if (subscription.statusSource === 'platform_override') {
      return createSkippedEvaluation({
        tenant,
        computedLifecycleStatus,
        targetStatus: tenant.status,
        subscriptionStatusSource: subscription.statusSource,
        skippedReason: 'platform_override_active',
        deletionExecution,
      });
    }

    const targetStatus = toTenantStatusUpdateTarget(computedLifecycleStatus);

    if (tenant.status === targetStatus) {
      return createSkippedEvaluation({
        tenant,
        computedLifecycleStatus,
        targetStatus,
        subscriptionStatusSource: subscription.statusSource,
        skippedReason: 'status_already_current',
        deletionExecution,
      });
    }

    const statusChange: TenantLifecycleStatusChange = {
      tenantId: tenant.id,
      fromStatus: tenant.status,
      toStatus: targetStatus,
      computedLifecycleStatus,
      reason: SYSTEM_LIFECYCLE_EVALUATION_REASON,
      effectiveAt: now,
    };

    const lifecycleEventInput: CreateTenantLifecycleEventInput = {
      id: '',
      tenantId: tenant.id,
      fromStatus: tenant.status,
      toStatus: targetStatus,
      source: 'system',
      reason: SYSTEM_LIFECYCLE_EVALUATION_REASON,
      effectiveAt: now,
      createdAt: now,
    };

    const systemAuditLogInput: RecordAuditLogInput = {
      tenantId: tenant.id,
      actorUserId: null,
      actorType: AUDIT_ACTOR_TYPES.SYSTEM,
      action: SYSTEM_LIFECYCLE_STATUS_CHANGED_ACTION,
      entityType: 'tenant',
      entityId: tenant.id,
      beforeJson: {
        status: tenant.status,
      },
      afterJson: {
        status: targetStatus,
      },
      metadataJson: {
        computed_lifecycle_status: computedLifecycleStatus,
        target_status: targetStatus,
        subscription_status_source: subscription.statusSource,
        subscription_expiration_date: subscription.expirationDate,
        tenant_timezone: tenant.timezone,
        evaluation_timestamp: now.toISOString(),
        deletion_execution_eligible: deletionExecution?.eligible ?? false,
      },
      reason: SYSTEM_LIFECYCLE_EVALUATION_REASON,
      createdAt: now,
    };

    return {
      tenantId: tenant.id,
      currentStatus: tenant.status,
      subscriptionStatusSource: subscription.statusSource,
      computedLifecycleStatus,
      targetStatus,
      shouldUpdateTenantStatus: true,
      skippedReason: null,
      statusChange,
      lifecycleEventInput,
      systemAuditLogInput,
      deletionExecution,
    };
  }
}

function createSkippedEvaluation(input: {
  readonly tenant: PlatformTenantDetailRecord;
  readonly computedLifecycleStatus: PlatformTenantStatus | null;
  readonly targetStatus: PlatformTenantStatus | null;
  readonly subscriptionStatusSource: string | null;
  readonly skippedReason: TenantLifecycleEvaluationSkipReason;
  readonly deletionExecution?: TenantLifecycleDeletionExecutionEvaluation | null;
}): TenantLifecycleEvaluationResult {
  return {
    tenantId: input.tenant.id,
    currentStatus: input.tenant.status,
    subscriptionStatusSource: input.subscriptionStatusSource,
    computedLifecycleStatus: input.computedLifecycleStatus,
    targetStatus: input.targetStatus,
    shouldUpdateTenantStatus: false,
    skippedReason: input.skippedReason,
    statusChange: null,
    lifecycleEventInput: null,
    systemAuditLogInput: null,
    deletionExecution: input.deletionExecution ?? null,
  };
}

function toTenantStatusUpdateTarget(
  computedLifecycleStatus: PlatformTenantStatus,
): PlatformTenantStatus {
  if (computedLifecycleStatus === 'deleted') {
    return 'pending_deletion';
  }

  return computedLifecycleStatus;
}

function normalizeCalculatedLifecycleStatus(value: unknown): PlatformTenantStatus {
  if (typeof value === 'string' && isPlatformTenantStatus(value)) {
    return value;
  }

  if (isRecord(value)) {
    const status = value.status ?? value.tenantStatus ?? value.tenant_status;

    if (typeof status === 'string' && isPlatformTenantStatus(status)) {
      return status;
    }
  }

  throw new Error('Subscription lifecycle calculator returned an unsupported tenant status.');
}

function isPlatformTenantStatus(value: string): value is PlatformTenantStatus {
  return PLATFORM_TENANT_STATUSES.includes(value as PlatformTenantStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
