import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AuditService, type RecordAuditLogInput } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type {
  CreateTenantLifecycleEventInput,
  PlatformTenantDetailRecord,
  PlatformTenantStatus,
  UpdateTenantStatusInput,
} from './platform-tenant.store';
import { PlatformTenantStore } from './platform-tenant.store';
import {
  TenantLifecycleEvaluationService,
  type TenantLifecycleEvaluationResult,
} from './tenant-lifecycle-evaluation.service';

const PENDING_DELETION_DAY_OFFSET = 68;
const INCONSISTENT_EVALUATION_ERROR =
  'Tenant lifecycle evaluation returned an inconsistent persistable result.';

interface DateOnlyParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface TenantDeletionScheduleUpdate {
  readonly shouldUpdate: boolean;
  readonly deletionScheduledFor: Date | null;
}

export interface EvaluateAndPersistTenantLifecycleInput {
  readonly tenantId: string;
  readonly now?: Date;
}

export interface EvaluateAndPersistTenantLifecycleResult {
  readonly tenant: PlatformTenantDetailRecord;
  readonly evaluation: TenantLifecycleEvaluationResult;
  readonly persisted: boolean;
  readonly lifecycleEventId: string | null;
  readonly deletionScheduledFor: Date | null;
}

@Injectable()
export class TenantLifecycleCommandService {
  constructor(
    @Inject(PlatformTenantStore)
    private readonly tenantStore: PlatformTenantStore,
    @Inject(TenantLifecycleEvaluationService)
    private readonly tenantLifecycleEvaluationService: TenantLifecycleEvaluationService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async evaluateAndPersistTenantLifecycle(
    input: EvaluateAndPersistTenantLifecycleInput,
  ): Promise<EvaluateAndPersistTenantLifecycleResult> {
    const now = input.now ?? new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const tenant = await this.tenantStore.findTenantById(input.tenantId, transaction);

      if (tenant === null) {
        throw GarageOsApiException.resourceNotFound('Tenant was not found.');
      }

      const evaluation = this.tenantLifecycleEvaluationService.evaluateTenantLifecycle({
        tenant,
        now,
      });

      if (!evaluation.shouldUpdateTenantStatus) {
        return {
          tenant,
          evaluation,
          persisted: false,
          lifecycleEventId: null,
          deletionScheduledFor: tenant.deletionScheduledFor,
        };
      }

      const targetStatus = requireTargetStatus(evaluation);
      const lifecycleEventInput = requireLifecycleEventInput(evaluation);
      const systemAuditLogInput = requireSystemAuditLogInput(evaluation);
      const deletionScheduleUpdate = resolveDeletionScheduleUpdate({
        tenant,
        targetStatus,
      });

      const updatedTenant = await this.tenantStore.updateTenantStatus(
        buildTenantStatusUpdateInput({
          tenantId: tenant.id,
          targetStatus,
          updatedAt: now,
          deletionScheduleUpdate,
        }),
        transaction,
      );

      const lifecycleEventId = randomUUID();

      await this.tenantStore.createTenantLifecycleEvent(
        {
          ...lifecycleEventInput,
          id: lifecycleEventId,
        },
        transaction,
      );

      await this.auditService.record({
        ...buildSystemAuditLogInput({
          systemAuditLogInput,
          deletionScheduleUpdate,
          previousDeletionScheduledFor: tenant.deletionScheduledFor,
        }),
        client: transaction,
      });

      return {
        tenant: updatedTenant,
        evaluation,
        persisted: true,
        lifecycleEventId,
        deletionScheduledFor: updatedTenant.deletionScheduledFor,
      };
    });
  }
}

function requireTargetStatus(evaluation: TenantLifecycleEvaluationResult): PlatformTenantStatus {
  if (evaluation.targetStatus === null) {
    throw new Error(INCONSISTENT_EVALUATION_ERROR);
  }

  return evaluation.targetStatus;
}

function requireLifecycleEventInput(
  evaluation: TenantLifecycleEvaluationResult,
): CreateTenantLifecycleEventInput {
  if (evaluation.lifecycleEventInput === null) {
    throw new Error(INCONSISTENT_EVALUATION_ERROR);
  }

  return evaluation.lifecycleEventInput;
}

function requireSystemAuditLogInput(
  evaluation: TenantLifecycleEvaluationResult,
): RecordAuditLogInput {
  if (evaluation.systemAuditLogInput === null) {
    throw new Error(INCONSISTENT_EVALUATION_ERROR);
  }

  return evaluation.systemAuditLogInput;
}

function buildTenantStatusUpdateInput(input: {
  readonly tenantId: string;
  readonly targetStatus: PlatformTenantStatus;
  readonly updatedAt: Date;
  readonly deletionScheduleUpdate: TenantDeletionScheduleUpdate;
}): UpdateTenantStatusInput {
  if (input.deletionScheduleUpdate.shouldUpdate) {
    return {
      tenantId: input.tenantId,
      status: input.targetStatus,
      updatedAt: input.updatedAt,
      deletionScheduledFor: input.deletionScheduleUpdate.deletionScheduledFor,
    };
  }

  return {
    tenantId: input.tenantId,
    status: input.targetStatus,
    updatedAt: input.updatedAt,
  };
}

function resolveDeletionScheduleUpdate(input: {
  readonly tenant: PlatformTenantDetailRecord;
  readonly targetStatus: PlatformTenantStatus;
}): TenantDeletionScheduleUpdate {
  if (input.targetStatus === 'pending_deletion') {
    if (input.tenant.subscription === null) {
      throw new Error('Pending deletion lifecycle status requires subscription data.');
    }

    return {
      shouldUpdate: true,
      deletionScheduledFor: calculateDeletionScheduledFor({
        expirationDate: input.tenant.subscription.expirationDate,
        tenantTimezone: input.tenant.timezone,
      }),
    };
  }

  if (input.tenant.deletionScheduledFor !== null) {
    return {
      shouldUpdate: true,
      deletionScheduledFor: null,
    };
  }

  return {
    shouldUpdate: false,
    deletionScheduledFor: null,
  };
}

function buildSystemAuditLogInput(input: {
  readonly systemAuditLogInput: RecordAuditLogInput;
  readonly deletionScheduleUpdate: TenantDeletionScheduleUpdate;
  readonly previousDeletionScheduledFor: Date | null;
}): RecordAuditLogInput {
  if (!input.deletionScheduleUpdate.shouldUpdate) {
    return input.systemAuditLogInput;
  }

  return {
    ...input.systemAuditLogInput,
    beforeJson: withDeletionScheduledFor(
      input.systemAuditLogInput.beforeJson,
      input.previousDeletionScheduledFor,
    ),
    afterJson: withDeletionScheduledFor(
      input.systemAuditLogInput.afterJson,
      input.deletionScheduleUpdate.deletionScheduledFor,
    ),
    metadataJson: withDeletionScheduledFor(
      input.systemAuditLogInput.metadataJson,
      input.deletionScheduleUpdate.deletionScheduledFor,
    ),
  };
}

function withDeletionScheduledFor(
  value: unknown,
  deletionScheduledFor: Date | null,
): Record<string, unknown> {
  return {
    ...(isRecord(value) ? value : {}),
    deletion_scheduled_for: deletionScheduledFor?.toISOString() ?? null,
  };
}

function calculateDeletionScheduledFor(input: {
  readonly expirationDate: string;
  readonly tenantTimezone: string;
}): Date {
  const deletionDateOnly = addDaysToDateOnly(input.expirationDate, PENDING_DELETION_DAY_OFFSET);

  return getStartOfDateOnlyInTimeZone(deletionDateOnly, input.tenantTimezone);
}

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const parts = parseDateOnly(dateOnly);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return date.toISOString().slice(0, 10);
}

function getStartOfDateOnlyInTimeZone(dateOnly: string, timeZone: string): Date {
  const parts = parseDateOnly(dateOnly);
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const firstOffset = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  const firstCandidate = new Date(utcGuess.getTime() - firstOffset);
  const correctedOffset = getTimeZoneOffsetMilliseconds(firstCandidate, timeZone);

  return new Date(utcGuess.getTime() - correctedOffset);
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
  } catch {
    throw new Error(`Invalid tenant timezone: ${timeZone}.`);
  }

  const year = Number(getDatePart(parts, 'year'));
  const month = Number(getDatePart(parts, 'month'));
  const day = Number(getDatePart(parts, 'day'));
  const hour = Number(getDatePart(parts, 'hour'));
  const minute = Number(getDatePart(parts, 'minute'));
  const second = Number(getDatePart(parts, 'second'));

  return Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
}

function parseDateOnly(value: string): DateOnlyParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Date must be a valid calendar date.');
  }

  return {
    year,
    month,
    day,
  };
}

function getDatePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new Error(`Unable to resolve ${type} for tenant timezone date.`);
  }

  return part.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
