import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../api/api-exception';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../database/database-transaction';
import {
  IDEMPOTENCY_STATUSES,
  type IdempotencyKeyRecord,
  IdempotencyKeyStore,
} from './idempotency-key.store';

export interface BeginIdempotencyInput {
  readonly tenantId: string | null;
  readonly userId: string | null;
  readonly endpoint: string;
  readonly idempotencyKey: string | null | undefined;
  readonly requestIntent: unknown;
  readonly now: Date;
  readonly expiresAt: Date;
  readonly lockedUntil?: Date | null;
}

export type IdempotencyBeginResult =
  | {
      readonly type: 'started';
      readonly record: IdempotencyKeyRecord;
    }
  | {
      readonly type: 'replayed';
      readonly record: IdempotencyKeyRecord;
      readonly responseStatusCode: number;
      readonly responseBodyJson: unknown;
    };

export interface CompleteIdempotencySucceededInput {
  readonly id: string;
  readonly responseStatusCode: number;
  readonly responseBodyJson: unknown;
  readonly now: Date;
}

export interface CompleteIdempotencyFailedInput {
  readonly id: string;
  readonly now: Date;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(IdempotencyKeyStore)
    private readonly store: IdempotencyKeyStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  async begin(input: BeginIdempotencyInput): Promise<IdempotencyBeginResult> {
    const now = input.now;
    const endpoint = this.normalizeEndpoint(input.endpoint);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const idempotencyKeyHash = hashText(idempotencyKey);
    const requestIntentHash = hashRequestIntent(input.requestIntent);

    this.assertExpirationIsUsable(input.expiresAt, now);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await this.store.lockScope(
        {
          lockKey: createLockKey({
            tenantId: input.tenantId,
            userId: input.userId,
            endpoint,
            idempotencyKeyHash,
          }),
        },
        transaction,
      );

      const existing = await this.store.findActiveByScopeAndKeyHash(
        {
          tenantId: input.tenantId,
          userId: input.userId,
          endpoint,
          idempotencyKeyHash,
          now,
        },
        transaction,
      );

      if (existing !== null) {
        return this.resolveExistingRecord(existing, requestIntentHash);
      }

      const record = await this.store.createProcessing(
        {
          id: randomUUID(),
          tenantId: input.tenantId,
          userId: input.userId,
          endpoint,
          requestIntentHash,
          idempotencyKeyHash,
          lockedUntil: input.lockedUntil ?? null,
          expiresAt: input.expiresAt,
        },
        transaction,
      );

      return {
        type: 'started',
        record,
      };
    });
  }

  async completeSucceeded(input: CompleteIdempotencySucceededInput): Promise<void> {
    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.store.markSucceeded(input, transaction);
    });
  }

  async completeFailed(input: CompleteIdempotencyFailedInput): Promise<void> {
    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.store.markFailed(input, transaction);
    });
  }

  private resolveExistingRecord(
    existing: IdempotencyKeyRecord,
    requestIntentHash: string,
  ): IdempotencyBeginResult {
    if (existing.requestIntentHash !== requestIntentHash) {
      throw GarageOsApiException.idempotencyConflict();
    }

    if (
      existing.status === IDEMPOTENCY_STATUSES.SUCCEEDED &&
      existing.responseStatusCode !== null
    ) {
      return {
        type: 'replayed',
        record: existing,
        responseStatusCode: existing.responseStatusCode,
        responseBodyJson: existing.responseBodyJson,
      };
    }

    throw GarageOsApiException.idempotencyConflict();
  }

  private normalizeEndpoint(endpoint: string): string {
    const normalizedEndpoint = endpoint.trim();

    if (normalizedEndpoint.length === 0) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'endpoint',
          code: 'required',
          message: 'Endpoint is required for idempotency scope.',
        },
      ]);
    }

    return normalizedEndpoint;
  }

  private normalizeIdempotencyKey(idempotencyKey: string | null | undefined): string {
    const normalizedKey = idempotencyKey?.trim();

    if (normalizedKey === undefined || normalizedKey.length === 0) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'Idempotency-Key',
          code: 'required',
          message: 'Idempotency-Key header is required for this operation.',
        },
      ]);
    }

    return normalizedKey;
  }

  private assertExpirationIsUsable(expiresAt: Date, now: Date): void {
    if (expiresAt.getTime() <= now.getTime()) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'expires_at',
          code: 'invalid_value',
          message: 'Idempotency expiration must be later than the request time.',
        },
      ]);
    }
  }
}

function createLockKey(input: {
  readonly tenantId: string | null;
  readonly userId: string | null;
  readonly endpoint: string;
  readonly idempotencyKeyHash: string;
}): string {
  return [
    input.tenantId ?? 'platform',
    input.userId ?? 'anonymous',
    input.endpoint,
    input.idempotencyKeyHash,
  ].join(':');
}

function hashRequestIntent(value: unknown): string {
  return hashText(stableJsonStringify(value));
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJsonStringify(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return `{${entries
      .map(
        ([entryKey, entryValue]) =>
          `${JSON.stringify(entryKey)}:${stableJsonStringify(entryValue)}`,
      )
      .join(',')}}`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'null';
  }

  return JSON.stringify(value);
}
