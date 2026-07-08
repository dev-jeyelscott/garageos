import { describe, expect, it } from 'vitest';

import {
  REMINDER_DUE_EVALUATION_JOB_TYPE,
  ReminderSchedulingWorker,
  type ReminderDueEvaluationHandler,
  type ReminderSchedulingJob,
  type ReminderSchedulingJobStore,
} from './reminder-scheduling-worker';

const WORKER_ID = 'worker-reminders-test';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const CLAIMED_AT = new Date('2026-07-08T00:00:00.000Z');
const COMPLETED_AT = new Date('2026-07-08T00:00:01.000Z');
const FAILED_AT = new Date('2026-07-08T00:00:02.000Z');

describe('ReminderSchedulingWorker', () => {
  it('claims only reminder due evaluation jobs and marks successful evaluations complete', async () => {
    const job = createJob();
    const store = new FakeReminderSchedulingJobStore([job]);
    const handler = new FakeReminderDueEvaluationHandler();
    const worker = createWorker(store, handler, [CLAIMED_AT, COMPLETED_AT]);

    const result = await worker.runOnce();

    expect(result).toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(store.claims).toEqual([
      {
        workerId: WORKER_ID,
        jobTypes: [REMINDER_DUE_EVALUATION_JOB_TYPE],
        batchSize: 10,
        now: CLAIMED_AT,
        lockDurationMs: 300_000,
      },
    ]);
    expect(handler.evaluations).toEqual([
      {
        job,
        now: CLAIMED_AT,
      },
    ]);
    expect(store.succeeded).toEqual([
      {
        jobId: JOB_ID,
        workerId: WORKER_ID,
        completedAt: COMPLETED_AT,
      },
    ]);
    expect(store.failed).toEqual([]);
  });

  it('marks failed evaluations retryable using the configured delay', async () => {
    const failure = new Error('Unable to evaluate due reminders.');
    const store = new FakeReminderSchedulingJobStore([createJob()]);
    const handler = new FakeReminderDueEvaluationHandler(failure);
    const worker = createWorker(store, handler, [CLAIMED_AT, FAILED_AT], {
      retryDelayMs: 60_000,
    });

    const result = await worker.runOnce();

    expect(result).toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(store.succeeded).toEqual([]);
    expect(store.failed).toEqual([
      {
        jobId: JOB_ID,
        workerId: WORKER_ID,
        error: failure,
        failedAt: FAILED_AT,
        nextRunAfter: new Date('2026-07-08T00:01:02.000Z'),
      },
    ]);
  });

  it('returns an empty result when no reminder jobs are due', async () => {
    const store = new FakeReminderSchedulingJobStore([]);
    const handler = new FakeReminderDueEvaluationHandler();
    const worker = createWorker(store, handler, [CLAIMED_AT]);

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(handler.evaluations).toEqual([]);
    expect(store.succeeded).toEqual([]);
    expect(store.failed).toEqual([]);
  });

  it('rejects invalid runtime configuration', () => {
    expect(
      () =>
        new ReminderSchedulingWorker(
          new FakeReminderSchedulingJobStore([]),
          new FakeReminderDueEvaluationHandler(),
          {
            workerId: ' ',
          },
        ),
    ).toThrow('Reminder scheduling worker ID is required.');

    expect(
      () =>
        new ReminderSchedulingWorker(
          new FakeReminderSchedulingJobStore([]),
          new FakeReminderDueEvaluationHandler(),
          {
            workerId: WORKER_ID,
            batchSize: 0,
          },
        ),
    ).toThrow('batchSize must be a positive integer.');
  });
});

function createWorker(
  store: ReminderSchedulingJobStore,
  handler: ReminderDueEvaluationHandler,
  timestamps: readonly Date[],
  overrides: {
    readonly retryDelayMs?: number;
  } = {},
): ReminderSchedulingWorker {
  let nowCallCount = 0;

  const config = {
    workerId: WORKER_ID,
    now: () => {
      const timestamp = timestamps[nowCallCount] ?? timestamps[timestamps.length - 1];
      nowCallCount += 1;

      if (timestamp === undefined) {
        throw new Error('Missing test timestamp.');
      }

      return timestamp;
    },
    ...(overrides.retryDelayMs === undefined ? {} : { retryDelayMs: overrides.retryDelayMs }),
  };

  return new ReminderSchedulingWorker(store, handler, config);
}

function createJob(overrides: Partial<ReminderSchedulingJob> = {}): ReminderSchedulingJob {
  return {
    id: overrides.id ?? JOB_ID,
    jobType: overrides.jobType ?? REMINDER_DUE_EVALUATION_JOB_TYPE,
  };
}

class FakeReminderSchedulingJobStore implements ReminderSchedulingJobStore {
  readonly claims: Array<{
    readonly workerId: string;
    readonly jobTypes: readonly string[];
    readonly batchSize: number;
    readonly now: Date;
    readonly lockDurationMs: number;
  }> = [];
  readonly succeeded: Array<{
    readonly jobId: string;
    readonly workerId: string;
    readonly completedAt: Date;
  }> = [];
  readonly failed: Array<{
    readonly jobId: string;
    readonly workerId: string;
    readonly error: unknown;
    readonly failedAt: Date;
    readonly nextRunAfter: Date;
  }> = [];

  constructor(private readonly jobs: readonly ReminderSchedulingJob[]) {}

  async claimDueJobs(input: {
    readonly workerId: string;
    readonly jobTypes: readonly string[];
    readonly batchSize: number;
    readonly now: Date;
    readonly lockDurationMs: number;
  }): Promise<readonly ReminderSchedulingJob[]> {
    this.claims.push(input);

    return this.jobs;
  }

  async markJobSucceeded(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly completedAt: Date;
  }): Promise<void> {
    this.succeeded.push(input);
  }

  async markJobFailed(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly error: unknown;
    readonly failedAt: Date;
    readonly nextRunAfter: Date;
  }): Promise<void> {
    this.failed.push(input);
  }
}

class FakeReminderDueEvaluationHandler implements ReminderDueEvaluationHandler {
  readonly evaluations: Array<{
    readonly job: ReminderSchedulingJob;
    readonly now: Date;
  }> = [];

  constructor(private readonly failure: Error | null = null) {}

  async evaluateDueReminders(job: ReminderSchedulingJob, now: Date): Promise<void> {
    this.evaluations.push({
      job,
      now,
    });

    if (this.failure !== null) {
      throw this.failure;
    }
  }
}
