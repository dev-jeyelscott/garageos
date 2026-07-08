export const REMINDER_DUE_EVALUATION_JOB_TYPE = 'reminder_due.evaluate' as const;

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LOCK_DURATION_MS = 5 * 60_000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60_000;

export interface ReminderSchedulingJob {
  readonly id: string;
  readonly jobType: string;
}

export interface ReminderSchedulingJobStore {
  claimDueJobs(input: {
    readonly workerId: string;
    readonly jobTypes: readonly string[];
    readonly batchSize: number;
    readonly now: Date;
    readonly lockDurationMs: number;
  }): Promise<readonly ReminderSchedulingJob[]>;

  markJobSucceeded(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly completedAt: Date;
  }): Promise<unknown>;

  markJobFailed(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly error: unknown;
    readonly failedAt: Date;
    readonly nextRunAfter: Date;
  }): Promise<unknown>;
}

export interface ReminderDueEvaluationHandler {
  evaluateDueReminders(job: ReminderSchedulingJob, now: Date): Promise<void>;
}

export interface ReminderSchedulingWorkerConfig {
  readonly workerId: string;
  readonly batchSize?: number;
  readonly lockDurationMs?: number;
  readonly retryDelayMs?: number;
  readonly now?: () => Date;
}

export interface ReminderSchedulingWorkerRunResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
}

export class ReminderSchedulingWorker {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly lockDurationMs: number;
  private readonly retryDelayMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly jobStore: ReminderSchedulingJobStore,
    private readonly handler: ReminderDueEvaluationHandler,
    config: ReminderSchedulingWorkerConfig,
  ) {
    this.workerId = normalizeWorkerId(config.workerId);
    this.batchSize = normalizePositiveInteger(config.batchSize ?? DEFAULT_BATCH_SIZE, 'batchSize');
    this.lockDurationMs = normalizePositiveInteger(
      config.lockDurationMs ?? DEFAULT_LOCK_DURATION_MS,
      'lockDurationMs',
    );
    this.retryDelayMs = normalizePositiveInteger(
      config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      'retryDelayMs',
    );
    this.now = config.now ?? (() => new Date());
  }

  async runOnce(): Promise<ReminderSchedulingWorkerRunResult> {
    const claimedAt = this.now();
    const jobs = await this.jobStore.claimDueJobs({
      workerId: this.workerId,
      jobTypes: [REMINDER_DUE_EVALUATION_JOB_TYPE],
      batchSize: this.batchSize,
      now: claimedAt,
      lockDurationMs: this.lockDurationMs,
    });

    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await this.handler.evaluateDueReminders(job, claimedAt);
        await this.jobStore.markJobSucceeded({
          jobId: job.id,
          workerId: this.workerId,
          completedAt: this.now(),
        });
        succeeded += 1;
      } catch (error) {
        const failedAt = this.now();

        await this.jobStore.markJobFailed({
          jobId: job.id,
          workerId: this.workerId,
          error,
          failedAt,
          nextRunAfter: new Date(failedAt.getTime() + this.retryDelayMs),
        });
        failed += 1;
      }
    }

    return {
      claimed: jobs.length,
      succeeded,
      failed,
    };
  }
}

function normalizeWorkerId(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error('Reminder scheduling worker ID is required.');
  }

  return normalized;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return value;
}
