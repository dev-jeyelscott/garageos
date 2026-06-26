import type { DatabaseQueryClient } from '../database/database-client';

export const IDEMPOTENCY_STATUSES = {
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;

export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[keyof typeof IDEMPOTENCY_STATUSES];

export interface IdempotencyKeyRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly userId: string | null;
  readonly endpoint: string;
  readonly requestIntentHash: string;
  readonly idempotencyKeyHash: string;
  readonly status: IdempotencyStatus;
  readonly responseStatusCode: number | null;
  readonly responseBodyJson: unknown | null;
  readonly lockedUntil: Date | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface LockIdempotencyScopeInput {
  readonly lockKey: string;
}

export interface FindActiveIdempotencyKeyInput {
  readonly tenantId: string | null;
  readonly userId: string | null;
  readonly endpoint: string;
  readonly idempotencyKeyHash: string;
  readonly now: Date;
}

export interface CreateProcessingIdempotencyKeyInput {
  readonly id: string;
  readonly tenantId: string | null;
  readonly userId: string | null;
  readonly endpoint: string;
  readonly requestIntentHash: string;
  readonly idempotencyKeyHash: string;
  readonly lockedUntil: Date | null;
  readonly expiresAt: Date;
}

export interface MarkIdempotencyKeySucceededInput {
  readonly id: string;
  readonly responseStatusCode: number;
  readonly responseBodyJson: unknown;
  readonly now: Date;
}

export interface MarkIdempotencyKeyFailedInput {
  readonly id: string;
  readonly now: Date;
}

export abstract class IdempotencyKeyStore {
  abstract lockScope(input: LockIdempotencyScopeInput, client: DatabaseQueryClient): Promise<void>;

  abstract findActiveByScopeAndKeyHash(
    input: FindActiveIdempotencyKeyInput,
    client: DatabaseQueryClient,
  ): Promise<IdempotencyKeyRecord | null>;

  abstract createProcessing(
    input: CreateProcessingIdempotencyKeyInput,
    client: DatabaseQueryClient,
  ): Promise<IdempotencyKeyRecord>;

  abstract markSucceeded(
    input: MarkIdempotencyKeySucceededInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract markFailed(
    input: MarkIdempotencyKeyFailedInput,
    client: DatabaseQueryClient,
  ): Promise<void>;
}
