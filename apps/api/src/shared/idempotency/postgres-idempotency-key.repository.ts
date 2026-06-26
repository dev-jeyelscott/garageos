import { Injectable } from '@nestjs/common';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../database/database-client';
import {
  IDEMPOTENCY_STATUSES,
  type CreateProcessingIdempotencyKeyInput,
  type FindActiveIdempotencyKeyInput,
  type IdempotencyKeyRecord,
  IdempotencyKeyStore,
  type LockIdempotencyScopeInput,
  type MarkIdempotencyKeyFailedInput,
  type MarkIdempotencyKeySucceededInput,
} from './idempotency-key.store';

interface IdempotencyKeyRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly user_id: string | null;
  readonly endpoint: string;
  readonly request_intent_hash: string;
  readonly idempotency_key_hash: string;
  readonly status: string;
  readonly response_status_code: number | null;
  readonly response_body_json: unknown | null;
  readonly locked_until: Date | string | null;
  readonly created_at: Date | string;
  readonly expires_at: Date | string;
}

@Injectable()
export class PostgresIdempotencyKeyRepository extends IdempotencyKeyStore {
  async lockScope(input: LockIdempotencyScopeInput, client: DatabaseQueryClient): Promise<void> {
    await client.query(
      `
        select pg_advisory_xact_lock(hashtextextended($1, 0))
      `,
      [input.lockKey],
    );
  }

  async findActiveByScopeAndKeyHash(
    input: FindActiveIdempotencyKeyInput,
    client: DatabaseQueryClient,
  ): Promise<IdempotencyKeyRecord | null> {
    const result = await client.query<IdempotencyKeyRow>(
      `
        select
          id,
          tenant_id,
          user_id,
          endpoint,
          request_intent_hash,
          idempotency_key_hash,
          status,
          response_status_code,
          response_body_json,
          locked_until,
          created_at,
          expires_at
        from idempotency_keys
        where tenant_id is not distinct from $1::uuid
          and user_id is not distinct from $2::uuid
          and endpoint = $3
          and idempotency_key_hash = $4
          and status <> $5
          and expires_at > $6::timestamptz
        order by created_at desc
        limit 1
        for update
      `,
      [
        input.tenantId,
        input.userId,
        input.endpoint,
        input.idempotencyKeyHash,
        IDEMPOTENCY_STATUSES.EXPIRED,
        input.now,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return mapIdempotencyKeyRow(row);
  }

  async createProcessing(
    input: CreateProcessingIdempotencyKeyInput,
    client: DatabaseQueryClient,
  ): Promise<IdempotencyKeyRecord> {
    const result = await client.query<IdempotencyKeyRow>(
      `
        insert into idempotency_keys (
          id,
          tenant_id,
          user_id,
          endpoint,
          request_intent_hash,
          idempotency_key_hash,
          status,
          locked_until,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning
          id,
          tenant_id,
          user_id,
          endpoint,
          request_intent_hash,
          idempotency_key_hash,
          status,
          response_status_code,
          response_body_json,
          locked_until,
          created_at,
          expires_at
      `,
      [
        input.id,
        input.tenantId,
        input.userId,
        input.endpoint,
        input.requestIntentHash,
        input.idempotencyKeyHash,
        IDEMPOTENCY_STATUSES.PROCESSING,
        input.lockedUntil,
        input.expiresAt,
      ],
    );

    return mapIdempotencyKeyRow(getRequiredRow(result, 'create idempotency key'));
  }

  async markSucceeded(
    input: MarkIdempotencyKeySucceededInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    const result = await client.query(
      `
        update idempotency_keys
        set
          status = $2,
          response_status_code = $3,
          response_body_json = $4::jsonb,
          locked_until = null
        where id = $1
          and status = $5
        returning id
      `,
      [
        input.id,
        IDEMPOTENCY_STATUSES.SUCCEEDED,
        input.responseStatusCode,
        JSON.stringify(input.responseBodyJson ?? null),
        IDEMPOTENCY_STATUSES.PROCESSING,
      ],
    );

    getRequiredRow(result, 'mark idempotency key succeeded');
  }

  async markFailed(
    input: MarkIdempotencyKeyFailedInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    const result = await client.query(
      `
        update idempotency_keys
        set
          status = $2,
          response_status_code = null,
          response_body_json = null,
          locked_until = null
        where id = $1
          and status = $3
        returning id
      `,
      [input.id, IDEMPOTENCY_STATUSES.FAILED, IDEMPOTENCY_STATUSES.PROCESSING],
    );

    getRequiredRow(result, 'mark idempotency key failed');
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Idempotency repository failed to ${operation}.`);
  }

  return row;
}

function mapIdempotencyKeyRow(row: IdempotencyKeyRow): IdempotencyKeyRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    endpoint: row.endpoint,
    requestIntentHash: row.request_intent_hash,
    idempotencyKeyHash: row.idempotency_key_hash,
    status: mapIdempotencyStatus(row.status),
    responseStatusCode: row.response_status_code,
    responseBodyJson: row.response_body_json,
    lockedUntil: toNullableDate(row.locked_until),
    createdAt: toDate(row.created_at),
    expiresAt: toDate(row.expires_at),
  };
}

function mapIdempotencyStatus(status: string): IdempotencyKeyRecord['status'] {
  if (
    status === IDEMPOTENCY_STATUSES.PROCESSING ||
    status === IDEMPOTENCY_STATUSES.SUCCEEDED ||
    status === IDEMPOTENCY_STATUSES.FAILED ||
    status === IDEMPOTENCY_STATUSES.EXPIRED
  ) {
    return status;
  }

  throw new Error(`Unknown idempotency status: ${status}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(value);
}
