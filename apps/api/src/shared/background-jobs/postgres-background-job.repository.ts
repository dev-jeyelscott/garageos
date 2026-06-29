import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../database/database-client';
import {
  BACKGROUND_JOB_STATUSES,
  type BackgroundJobRecord,
  type BackgroundJobStatus,
  BackgroundJobStore,
  type ClaimDueBackgroundJobsInput,
  type CreateQueuedBackgroundJobInput,
  type MarkBackgroundJobFailedInput,
  type MarkBackgroundJobSucceededInput,
} from './background-job.store';

interface BackgroundJobRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly job_type: string;
  readonly status: string;
  readonly payload_json: unknown;
  readonly run_after: Date | string;
  readonly attempt_count: number;
  readonly max_attempts: number;
  readonly locked_by: string | null;
  readonly locked_until: Date | string | null;
  readonly created_at: Date | string;
  readonly started_at: Date | string | null;
  readonly completed_at: Date | string | null;
  readonly failed_at: Date | string | null;
  readonly last_error: string | null;
  readonly correlation_id: string | null;
}

const CLAIMABLE_JOB_STATUSES = [
  BACKGROUND_JOB_STATUSES.QUEUED,
  BACKGROUND_JOB_STATUSES.FAILED,
] as const;

@Injectable()
export class PostgresBackgroundJobRepository extends BackgroundJobStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async createQueued(
    input: CreateQueuedBackgroundJobInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<BackgroundJobRecord> {
    const result = await client.query<BackgroundJobRow>(
      `
        insert into background_jobs (
          id,
          tenant_id,
          job_type,
          status,
          payload_json,
          run_after,
          max_attempts,
          correlation_id
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        returning
          id,
          tenant_id,
          job_type,
          status,
          payload_json,
          run_after,
          attempt_count,
          max_attempts,
          locked_by,
          locked_until,
          created_at,
          started_at,
          completed_at,
          failed_at,
          last_error,
          correlation_id
      `,
      [
        input.id,
        input.tenantId,
        input.jobType,
        BACKGROUND_JOB_STATUSES.QUEUED,
        JSON.stringify(input.payloadJson),
        input.runAfter,
        input.maxAttempts,
        input.correlationId,
      ],
    );

    return mapBackgroundJobRow(getRequiredRow(result, 'create queued background job'));
  }

  async claimDue(
    input: ClaimDueBackgroundJobsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly BackgroundJobRecord[]> {
    const jobTypes = input.jobTypes.length === 0 ? null : input.jobTypes;

    const result = await client.query<BackgroundJobRow>(
      `
        with candidate_jobs as (
          select id
          from background_jobs
          where (
              (
                status = any($6::text[])
                and run_after <= $1::timestamptz
                and locked_by is null
                and locked_until is null
              )
              or (
                status = $7
                and locked_until is not null
                and locked_until <= $1::timestamptz
              )
            )
            and ($5::text[] is null or job_type = any($5::text[]))
          order by run_after asc, created_at asc, id asc
          for update skip locked
          limit $2
        ),
        updated_jobs as (
          update background_jobs job
          set
            status = $7,
            locked_by = $3,
            locked_until = $4,
            started_at = $1,
            attempt_count = attempt_count + 1
          from candidate_jobs
          where job.id = candidate_jobs.id
          returning
            job.id,
            job.tenant_id,
            job.job_type,
            job.status,
            job.payload_json,
            job.run_after,
            job.attempt_count,
            job.max_attempts,
            job.locked_by,
            job.locked_until,
            job.created_at,
            job.started_at,
            job.completed_at,
            job.failed_at,
            job.last_error,
            job.correlation_id
        ),
        inserted_attempts as (
          insert into background_job_attempts (
            id,
            job_id,
            attempt_number,
            started_at,
            status
          )
          select
            gen_random_uuid(),
            id,
            attempt_count,
            $1,
            $7
          from updated_jobs
          on conflict (job_id, attempt_number) do nothing
          returning job_id
        )
        select
          id,
          tenant_id,
          job_type,
          status,
          payload_json,
          run_after,
          attempt_count,
          max_attempts,
          locked_by,
          locked_until,
          created_at,
          started_at,
          completed_at,
          failed_at,
          last_error,
          correlation_id
        from updated_jobs
        order by run_after asc, created_at asc, id asc
      `,
      [
        input.now,
        input.batchSize,
        input.workerId,
        input.lockedUntil,
        jobTypes,
        CLAIMABLE_JOB_STATUSES,
        BACKGROUND_JOB_STATUSES.RUNNING,
      ],
    );

    return result.rows.map(mapBackgroundJobRow);
  }

  async markSucceeded(
    input: MarkBackgroundJobSucceededInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<BackgroundJobRecord> {
    const result = await client.query<BackgroundJobRow>(
      `
        with updated_job as (
          update background_jobs
          set
            status = $4,
            completed_at = $3,
            locked_by = null,
            locked_until = null,
            last_error = null
          where id = $1
            and locked_by = $2
            and status = $5
          returning
            id,
            tenant_id,
            job_type,
            status,
            payload_json,
            run_after,
            attempt_count,
            max_attempts,
            locked_by,
            locked_until,
            created_at,
            started_at,
            completed_at,
            failed_at,
            last_error,
            correlation_id
        ),
        updated_attempt as (
          update background_job_attempts attempt
          set
            finished_at = $3,
            status = $4,
            error_message = null
          where attempt.job_id = $1
            and attempt.attempt_number = (select attempt_count from updated_job)
          returning attempt.job_id
        )
        select
          id,
          tenant_id,
          job_type,
          status,
          payload_json,
          run_after,
          attempt_count,
          max_attempts,
          locked_by,
          locked_until,
          created_at,
          started_at,
          completed_at,
          failed_at,
          last_error,
          correlation_id
        from updated_job
      `,
      [
        input.jobId,
        input.workerId,
        input.completedAt,
        BACKGROUND_JOB_STATUSES.SUCCEEDED,
        BACKGROUND_JOB_STATUSES.RUNNING,
      ],
    );

    return mapBackgroundJobRow(getRequiredRow(result, 'mark background job succeeded'));
  }

  async markFailed(
    input: MarkBackgroundJobFailedInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<BackgroundJobRecord> {
    const result = await client.query<BackgroundJobRow>(
      `
        with updated_job as (
          update background_jobs
          set
            status = case
              when attempt_count >= max_attempts then $4
              else $5
            end,
            run_after = case
              when attempt_count >= max_attempts then run_after
              else $6
            end,
            locked_by = null,
            locked_until = null,
            failed_at = $3,
            last_error = $7
          where id = $1
            and locked_by = $2
            and status = $8
          returning
            id,
            tenant_id,
            job_type,
            status,
            payload_json,
            run_after,
            attempt_count,
            max_attempts,
            locked_by,
            locked_until,
            created_at,
            started_at,
            completed_at,
            failed_at,
            last_error,
            correlation_id
        ),
        updated_attempt as (
          update background_job_attempts attempt
          set
            finished_at = $3,
            status = (select status from updated_job),
            error_message = $7
          where attempt.job_id = $1
            and attempt.attempt_number = (select attempt_count from updated_job)
          returning attempt.job_id
        )
        select
          id,
          tenant_id,
          job_type,
          status,
          payload_json,
          run_after,
          attempt_count,
          max_attempts,
          locked_by,
          locked_until,
          created_at,
          started_at,
          completed_at,
          failed_at,
          last_error,
          correlation_id
        from updated_job
      `,
      [
        input.jobId,
        input.workerId,
        input.failedAt,
        BACKGROUND_JOB_STATUSES.DEAD_LETTERED,
        BACKGROUND_JOB_STATUSES.FAILED,
        input.nextRunAfter,
        input.lastError,
        BACKGROUND_JOB_STATUSES.RUNNING,
      ],
    );

    return mapBackgroundJobRow(getRequiredRow(result, 'mark background job failed'));
  }
}

function mapBackgroundJobRow(row: BackgroundJobRow): BackgroundJobRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobType: row.job_type,
    status: toBackgroundJobStatus(row.status),
    payloadJson: normalizeJsonObject(row.payload_json),
    runAfter: toDate(row.run_after),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    lockedBy: row.locked_by,
    lockedUntil: toNullableDate(row.locked_until),
    createdAt: toDate(row.created_at),
    startedAt: toNullableDate(row.started_at),
    completedAt: toNullableDate(row.completed_at),
    failedAt: toNullableDate(row.failed_at),
    lastError: row.last_error,
    correlationId: row.correlation_id,
  };
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return normalizeJsonObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Background job repository failed to ${operation}.`);
  }

  return row;
}

function toBackgroundJobStatus(value: string): BackgroundJobStatus {
  switch (value) {
    case BACKGROUND_JOB_STATUSES.QUEUED:
    case BACKGROUND_JOB_STATUSES.RUNNING:
    case BACKGROUND_JOB_STATUSES.SUCCEEDED:
    case BACKGROUND_JOB_STATUSES.FAILED:
    case BACKGROUND_JOB_STATUSES.CANCELLED:
    case BACKGROUND_JOB_STATUSES.DEAD_LETTERED:
      return value;
    default:
      throw new Error(`Unsupported background job status: ${value}`);
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}
