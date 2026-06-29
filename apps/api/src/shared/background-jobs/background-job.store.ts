import type { DatabaseQueryClient } from '../database/database-client';

export const BACKGROUND_JOB_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  DEAD_LETTERED: 'dead_lettered',
} as const;

export type BackgroundJobStatus =
  (typeof BACKGROUND_JOB_STATUSES)[keyof typeof BACKGROUND_JOB_STATUSES];

export interface BackgroundJobRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly jobType: string;
  readonly status: BackgroundJobStatus;
  readonly payloadJson: Record<string, unknown>;
  readonly runAfter: Date;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lockedBy: string | null;
  readonly lockedUntil: Date | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failedAt: Date | null;
  readonly lastError: string | null;
  readonly correlationId: string | null;
}

export interface CreateQueuedBackgroundJobInput {
  readonly id: string;
  readonly tenantId: string | null;
  readonly jobType: string;
  readonly payloadJson: Record<string, unknown>;
  readonly runAfter: Date;
  readonly maxAttempts: number;
  readonly correlationId: string | null;
}

export interface ClaimDueBackgroundJobsInput {
  readonly workerId: string;
  readonly jobTypes: readonly string[];
  readonly batchSize: number;
  readonly now: Date;
  readonly lockedUntil: Date;
}

export interface MarkBackgroundJobSucceededInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly completedAt: Date;
}

export interface MarkBackgroundJobFailedInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly failedAt: Date;
  readonly nextRunAfter: Date;
  readonly lastError: string;
}

export abstract class BackgroundJobStore {
  abstract createQueued(
    input: CreateQueuedBackgroundJobInput,
    client: DatabaseQueryClient,
  ): Promise<BackgroundJobRecord>;

  abstract claimDue(
    input: ClaimDueBackgroundJobsInput,
    client: DatabaseQueryClient,
  ): Promise<readonly BackgroundJobRecord[]>;

  abstract markSucceeded(
    input: MarkBackgroundJobSucceededInput,
    client: DatabaseQueryClient,
  ): Promise<BackgroundJobRecord>;

  abstract markFailed(
    input: MarkBackgroundJobFailedInput,
    client: DatabaseQueryClient,
  ): Promise<BackgroundJobRecord>;
}
