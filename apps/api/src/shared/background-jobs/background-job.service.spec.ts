import { describe, expect, it } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../database/database-client';
import type { DatabaseTransactionRunner } from '../database/database-transaction';
import {
  BACKGROUND_JOB_STATUSES,
  type BackgroundJobRecord,
  BackgroundJobStore,
  type ClaimDueBackgroundJobsInput,
  type CreateQueuedBackgroundJobInput,
  type MarkBackgroundJobFailedInput,
  type MarkBackgroundJobSucceededInput,
} from './background-job.store';
import { BackgroundJobService } from './background-job.service';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const WORKER_A = 'worker-a';
const WORKER_B = 'worker-b';
const NOW = new Date('2026-06-30T00:00:00.000Z');
const LOCKED_UNTIL = new Date('2026-06-30T00:05:00.000Z');
const NEXT_RUN_AFTER = new Date('2026-06-30T00:10:00.000Z');

describe('BackgroundJobService', () => {
  it('enqueues a queued background job transactionally', async () => {
    const { service, store, transactionRunner } = createService();

    const job = await service.enqueue({
      tenantId: TENANT_ID,
      jobType: 'tenant_export.generate',
      payloadJson: {
        tenant_id: TENANT_ID,
      },
      runAfter: NOW,
      maxAttempts: 5,
      correlationId: 'corr-test',
      now: NOW,
    });

    expect(job).toMatchObject({
      tenantId: TENANT_ID,
      jobType: 'tenant_export.generate',
      status: BACKGROUND_JOB_STATUSES.QUEUED,
      payloadJson: {
        tenant_id: TENANT_ID,
      },
      runAfter: NOW,
      attemptCount: 0,
      maxAttempts: 5,
      lockedBy: null,
      lockedUntil: null,
      correlationId: 'corr-test',
    });
    expect(job.id).not.toBe('');
    expect(store.jobs).toHaveLength(1);
    expect(transactionRunner.runCount).toBe(1);
  });

  it('claims due jobs by setting running status, lock metadata, and attempt history', async () => {
    const { service, store } = createService();

    store.jobs.push(
      createJobRecord({
        id: JOB_ID,
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: new Date('2026-06-29T23:59:00.000Z'),
      }),
      createJobRecord({
        id: '44444444-4444-4444-8444-444444444444',
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: new Date('2026-06-30T00:30:00.000Z'),
      }),
    );

    const jobs = await service.claimDueJobs({
      workerId: WORKER_A,
      batchSize: 10,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: JOB_ID,
      status: BACKGROUND_JOB_STATUSES.RUNNING,
      attemptCount: 1,
      lockedBy: WORKER_A,
      lockedUntil: LOCKED_UNTIL,
      startedAt: NOW,
    });
    expect(store.attempts).toEqual([
      {
        jobId: JOB_ID,
        attemptNumber: 1,
        startedAt: NOW,
        finishedAt: null,
        status: BACKGROUND_JOB_STATUSES.RUNNING,
        errorMessage: null,
      },
    ]);
  });

  it('prevents duplicate claims while a job is locked by another worker', async () => {
    const { service, store } = createService();

    store.jobs.push(
      createJobRecord({
        id: JOB_ID,
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: NOW,
      }),
    );

    const firstClaim = await service.claimDueJobs({
      workerId: WORKER_A,
      batchSize: 1,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    const secondClaim = await service.claimDueJobs({
      workerId: WORKER_B,
      batchSize: 1,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    expect(firstClaim).toHaveLength(1);
    expect(secondClaim).toEqual([]);
    expect(store.jobs[0]).toMatchObject({
      id: JOB_ID,
      status: BACKGROUND_JOB_STATUSES.RUNNING,
      lockedBy: WORKER_A,
    });
    expect(store.attempts).toHaveLength(1);
  });

  it('marks a running job as failed and retryable when attempts remain', async () => {
    const { service, store } = createService();

    store.jobs.push(
      createJobRecord({
        id: JOB_ID,
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: NOW,
        maxAttempts: 2,
      }),
    );

    await service.claimDueJobs({
      workerId: WORKER_A,
      batchSize: 1,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    const failedJob = await service.markJobFailed({
      jobId: JOB_ID,
      workerId: WORKER_A,
      failedAt: NOW,
      nextRunAfter: NEXT_RUN_AFTER,
      error: new Error('Provider timeout'),
    });

    expect(failedJob).toMatchObject({
      id: JOB_ID,
      status: BACKGROUND_JOB_STATUSES.FAILED,
      runAfter: NEXT_RUN_AFTER,
      attemptCount: 1,
      maxAttempts: 2,
      lockedBy: null,
      lockedUntil: null,
      failedAt: NOW,
      lastError: 'Provider timeout',
    });
    expect(store.attempts[0]).toEqual({
      jobId: JOB_ID,
      attemptNumber: 1,
      startedAt: NOW,
      finishedAt: NOW,
      status: BACKGROUND_JOB_STATUSES.FAILED,
      errorMessage: 'Provider timeout',
    });
  });

  it('dead-letters a failed job when max attempts are reached', async () => {
    const { service, store } = createService();

    store.jobs.push(
      createJobRecord({
        id: JOB_ID,
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: NOW,
        maxAttempts: 1,
      }),
    );

    await service.claimDueJobs({
      workerId: WORKER_A,
      batchSize: 1,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    const failedJob = await service.markJobFailed({
      jobId: JOB_ID,
      workerId: WORKER_A,
      failedAt: NOW,
      nextRunAfter: NEXT_RUN_AFTER,
      error: 'Permanent failure',
    });

    expect(failedJob).toMatchObject({
      id: JOB_ID,
      status: BACKGROUND_JOB_STATUSES.DEAD_LETTERED,
      runAfter: NOW,
      attemptCount: 1,
      maxAttempts: 1,
      lockedBy: null,
      lockedUntil: null,
      failedAt: NOW,
      lastError: 'Permanent failure',
    });
    expect(store.attempts[0]?.status).toBe(BACKGROUND_JOB_STATUSES.DEAD_LETTERED);
  });

  it('marks a locked running job as succeeded for the owning worker only', async () => {
    const { service, store } = createService();

    store.jobs.push(
      createJobRecord({
        id: JOB_ID,
        status: BACKGROUND_JOB_STATUSES.QUEUED,
        runAfter: NOW,
      }),
    );

    await service.claimDueJobs({
      workerId: WORKER_A,
      batchSize: 1,
      now: NOW,
      lockDurationMs: LOCKED_UNTIL.getTime() - NOW.getTime(),
    });

    await expect(
      service.markJobSucceeded({
        jobId: JOB_ID,
        workerId: WORKER_B,
        completedAt: NOW,
      }),
    ).rejects.toThrow('Background job was not locked by this worker.');

    const succeededJob = await service.markJobSucceeded({
      jobId: JOB_ID,
      workerId: WORKER_A,
      completedAt: NOW,
    });

    expect(succeededJob).toMatchObject({
      id: JOB_ID,
      status: BACKGROUND_JOB_STATUSES.SUCCEEDED,
      completedAt: NOW,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
    });
    expect(store.attempts[0]?.status).toBe(BACKGROUND_JOB_STATUSES.SUCCEEDED);
  });
});

function createService(): {
  readonly service: BackgroundJobService;
  readonly store: FakeBackgroundJobStore;
  readonly transactionRunner: FakeTransactionRunner;
} {
  const store = new FakeBackgroundJobStore();
  const transactionRunner = new FakeTransactionRunner();

  return {
    service: new BackgroundJobService(store, transactionRunner),
    store,
    transactionRunner,
  };
}

interface FakeBackgroundJobAttempt {
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: string;
  readonly errorMessage: string | null;
}

class FakeBackgroundJobStore extends BackgroundJobStore {
  readonly jobs: BackgroundJobRecord[] = [];
  readonly attempts: FakeBackgroundJobAttempt[] = [];

  async createQueued(input: CreateQueuedBackgroundJobInput): Promise<BackgroundJobRecord> {
    const job = createJobRecord({
      id: input.id,
      tenantId: input.tenantId,
      jobType: input.jobType,
      status: BACKGROUND_JOB_STATUSES.QUEUED,
      payloadJson: input.payloadJson,
      runAfter: input.runAfter,
      maxAttempts: input.maxAttempts,
      correlationId: input.correlationId,
    });

    this.jobs.push(job);

    return job;
  }

  async claimDue(input: ClaimDueBackgroundJobsInput): Promise<readonly BackgroundJobRecord[]> {
    const lockedUntil = input.lockedUntil;
    const jobTypeFilter = new Set(input.jobTypes);
    const claimedJobs: BackgroundJobRecord[] = [];

    const claimableJobs = this.jobs
      .filter((job) => {
        const hasMatchingType = jobTypeFilter.size === 0 || jobTypeFilter.has(job.jobType);
        const isDueRetryable =
          (job.status === BACKGROUND_JOB_STATUSES.QUEUED ||
            job.status === BACKGROUND_JOB_STATUSES.FAILED) &&
          job.runAfter.getTime() <= input.now.getTime() &&
          job.lockedBy === null &&
          job.lockedUntil === null;
        const isExpiredRunning =
          job.status === BACKGROUND_JOB_STATUSES.RUNNING &&
          job.lockedUntil !== null &&
          job.lockedUntil.getTime() <= input.now.getTime();

        return hasMatchingType && (isDueRetryable || isExpiredRunning);
      })
      .sort((left, right) => {
        const runAfterDelta = left.runAfter.getTime() - right.runAfter.getTime();

        if (runAfterDelta !== 0) {
          return runAfterDelta;
        }

        const createdAtDelta = left.createdAt.getTime() - right.createdAt.getTime();

        if (createdAtDelta !== 0) {
          return createdAtDelta;
        }

        return left.id.localeCompare(right.id);
      })
      .slice(0, input.batchSize);

    for (const job of claimableJobs) {
      const updatedJob = replaceJob(this.jobs, job.id, {
        ...job,
        status: BACKGROUND_JOB_STATUSES.RUNNING,
        attemptCount: job.attemptCount + 1,
        lockedBy: input.workerId,
        lockedUntil,
        startedAt: input.now,
      });

      this.attempts.push({
        jobId: updatedJob.id,
        attemptNumber: updatedJob.attemptCount,
        startedAt: input.now,
        finishedAt: null,
        status: BACKGROUND_JOB_STATUSES.RUNNING,
        errorMessage: null,
      });

      claimedJobs.push(updatedJob);
    }

    return claimedJobs;
  }

  async markSucceeded(input: MarkBackgroundJobSucceededInput): Promise<BackgroundJobRecord> {
    const job = this.findLockedRunningJob(input.jobId, input.workerId);
    const updatedJob = replaceJob(this.jobs, job.id, {
      ...job,
      status: BACKGROUND_JOB_STATUSES.SUCCEEDED,
      completedAt: input.completedAt,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
    });

    this.finishAttempt({
      jobId: updatedJob.id,
      attemptNumber: updatedJob.attemptCount,
      finishedAt: input.completedAt,
      status: BACKGROUND_JOB_STATUSES.SUCCEEDED,
      errorMessage: null,
    });

    return updatedJob;
  }

  async markFailed(input: MarkBackgroundJobFailedInput): Promise<BackgroundJobRecord> {
    const job = this.findLockedRunningJob(input.jobId, input.workerId);
    const status =
      job.attemptCount >= job.maxAttempts
        ? BACKGROUND_JOB_STATUSES.DEAD_LETTERED
        : BACKGROUND_JOB_STATUSES.FAILED;
    const updatedJob = replaceJob(this.jobs, job.id, {
      ...job,
      status,
      runAfter: status === BACKGROUND_JOB_STATUSES.FAILED ? input.nextRunAfter : job.runAfter,
      lockedBy: null,
      lockedUntil: null,
      failedAt: input.failedAt,
      lastError: input.lastError,
    });

    this.finishAttempt({
      jobId: updatedJob.id,
      attemptNumber: updatedJob.attemptCount,
      finishedAt: input.failedAt,
      status,
      errorMessage: input.lastError,
    });

    return updatedJob;
  }

  private findLockedRunningJob(jobId: string, workerId: string): BackgroundJobRecord {
    const job = this.jobs.find((candidate) => candidate.id === jobId);

    if (job === undefined || job.status !== BACKGROUND_JOB_STATUSES.RUNNING) {
      throw new Error('Background job is not running.');
    }

    if (job.lockedBy !== workerId) {
      throw new Error('Background job was not locked by this worker.');
    }

    return job;
  }

  private finishAttempt(input: {
    readonly jobId: string;
    readonly attemptNumber: number;
    readonly finishedAt: Date;
    readonly status: string;
    readonly errorMessage: string | null;
  }): void {
    const index = this.attempts.findIndex(
      (attempt) => attempt.jobId === input.jobId && attempt.attemptNumber === input.attemptNumber,
    );

    if (index < 0) {
      throw new Error('Background job attempt was not found.');
    }

    const currentAttempt = this.attempts[index];

    if (currentAttempt === undefined) {
      throw new Error('Background job attempt was not found.');
    }

    this.attempts[index] = {
      ...currentAttempt,
      finishedAt: input.finishedAt,
      status: input.status,
      errorMessage: input.errorMessage,
    };
  }
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
  runCount = 0;

  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    this.runCount += 1;

    return work(FAKE_DATABASE_CLIENT);
  }
}

function replaceJob(
  jobs: BackgroundJobRecord[],
  jobId: string,
  replacement: BackgroundJobRecord,
): BackgroundJobRecord {
  const index = jobs.findIndex((job) => job.id === jobId);

  if (index < 0) {
    throw new Error('Background job was not found.');
  }

  jobs[index] = replacement;

  return replacement;
}

function createJobRecord(overrides: Partial<BackgroundJobRecord> = {}): BackgroundJobRecord {
  const createdAt = overrides.createdAt ?? new Date('2026-06-29T23:00:00.000Z');

  return {
    id: overrides.id ?? JOB_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    jobType: overrides.jobType ?? 'tenant_lifecycle.evaluate',
    status: overrides.status ?? BACKGROUND_JOB_STATUSES.QUEUED,
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
