import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../api/api-exception';
import type { DatabaseQueryClient } from '../database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../database/database-transaction';
import { type BackgroundJobRecord, BackgroundJobStore } from './background-job.store';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;
const MAX_ERROR_SUMMARY_LENGTH = 2_000;

export interface EnqueueBackgroundJobInput {
  readonly tenantId?: string | null;
  readonly jobType: string;
  readonly payloadJson?: Record<string, unknown>;
  readonly runAfter?: Date;
  readonly maxAttempts?: number;
  readonly correlationId?: string | null;
  readonly now?: Date;
}

export interface ClaimDueBackgroundJobsInput {
  readonly workerId: string;
  readonly jobTypes?: readonly string[];
  readonly batchSize?: number;
  readonly now?: Date;
  readonly lockDurationMs: number;
}

export interface MarkBackgroundJobSucceededInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly completedAt?: Date;
}

export interface MarkBackgroundJobFailedInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly error: unknown;
  readonly failedAt?: Date;
  readonly nextRunAfter: Date;
}

@Injectable()
export class BackgroundJobService {
  constructor(
    @Inject(BackgroundJobStore)
    private readonly store: BackgroundJobStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  async enqueue(input: EnqueueBackgroundJobInput): Promise<BackgroundJobRecord> {
    return this.transactionRunner.runInTransaction(async (transaction) =>
      this.enqueueInTransaction(input, transaction),
    );
  }

  async enqueueInTransaction(
    input: EnqueueBackgroundJobInput,
    transaction: DatabaseQueryClient,
  ): Promise<BackgroundJobRecord> {
    const now = input.now ?? new Date();
    const jobType = normalizeRequiredText(input.jobType, 'job_type', 'Job type is required.');
    const maxAttempts = normalizePositiveInteger(
      input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      'max_attempts',
      'Max attempts must be a positive integer.',
    );

    return this.store.createQueued(
      {
        id: randomUUID(),
        tenantId: input.tenantId ?? null,
        jobType,
        payloadJson: input.payloadJson ?? {},
        runAfter: input.runAfter ?? now,
        maxAttempts,
        correlationId: input.correlationId ?? null,
      },
      transaction,
    );
  }

  async claimDueJobs(input: ClaimDueBackgroundJobsInput): Promise<readonly BackgroundJobRecord[]> {
    const now = input.now ?? new Date();
    const workerId = normalizeRequiredText(input.workerId, 'worker_id', 'Worker ID is required.');
    const batchSize = normalizeBatchSize(input.batchSize ?? DEFAULT_BATCH_SIZE);
    const lockDurationMs = normalizePositiveInteger(
      input.lockDurationMs,
      'lock_duration_ms',
      'Lock duration must be a positive integer.',
    );
    const jobTypes = normalizeJobTypes(input.jobTypes ?? []);

    return this.transactionRunner.runInTransaction(async (transaction) =>
      this.store.claimDue(
        {
          workerId,
          jobTypes,
          batchSize,
          now,
          lockedUntil: new Date(now.getTime() + lockDurationMs),
        },
        transaction,
      ),
    );
  }

  async markJobSucceeded(input: MarkBackgroundJobSucceededInput): Promise<BackgroundJobRecord> {
    const completedAt = input.completedAt ?? new Date();

    return this.transactionRunner.runInTransaction(async (transaction) =>
      this.store.markSucceeded(
        {
          jobId: normalizeRequiredText(input.jobId, 'job_id', 'Job ID is required.'),
          workerId: normalizeRequiredText(input.workerId, 'worker_id', 'Worker ID is required.'),
          completedAt,
        },
        transaction,
      ),
    );
  }

  async markJobFailed(input: MarkBackgroundJobFailedInput): Promise<BackgroundJobRecord> {
    const failedAt = input.failedAt ?? new Date();

    if (input.nextRunAfter.getTime() < failedAt.getTime()) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'next_run_after',
          code: 'invalid_value',
          message: 'Next run time cannot be earlier than the failure time.',
        },
      ]);
    }

    return this.transactionRunner.runInTransaction(async (transaction) =>
      this.store.markFailed(
        {
          jobId: normalizeRequiredText(input.jobId, 'job_id', 'Job ID is required.'),
          workerId: normalizeRequiredText(input.workerId, 'worker_id', 'Worker ID is required.'),
          failedAt,
          nextRunAfter: input.nextRunAfter,
          lastError: normalizeErrorSummary(input.error),
        },
        transaction,
      ),
    );
  }
}

function normalizeRequiredText(value: string, field: string, message: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message,
      },
    ]);
  }

  return normalized;
}

function normalizePositiveInteger(value: number, field: string, message: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_value',
        message,
      },
    ]);
  }

  return value;
}

function normalizeBatchSize(value: number): number {
  const batchSize = normalizePositiveInteger(
    value,
    'batch_size',
    'Batch size must be a positive integer.',
  );

  if (batchSize > MAX_BATCH_SIZE) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'batch_size',
        code: 'too_large',
        message: `Batch size cannot exceed ${MAX_BATCH_SIZE}.`,
      },
    ]);
  }

  return batchSize;
}

function normalizeJobTypes(jobTypes: readonly string[]): readonly string[] {
  const normalizedJobTypes = new Set<string>();

  for (const jobType of jobTypes) {
    normalizedJobTypes.add(normalizeRequiredText(jobType, 'job_types', 'Job type is required.'));
  }

  return [...normalizedJobTypes].sort((left, right) => left.localeCompare(right));
}

function normalizeErrorSummary(error: unknown): string {
  const summary =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error ?? 'Unknown background job failure.');

  const normalized = summary.trim();

  if (normalized.length === 0) {
    return 'Unknown background job failure.';
  }

  return normalized.slice(0, MAX_ERROR_SUMMARY_LENGTH);
}
