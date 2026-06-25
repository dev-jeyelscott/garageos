export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed';

export const API_IDEMPOTENCY_STORE = Symbol('API_IDEMPOTENCY_STORE');

export const IDEMPOTENCY_STATUSES = {
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;

export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[keyof typeof IDEMPOTENCY_STATUSES];

export const IDEMPOTENCY_RESERVATION_OUTCOMES = {
  RESERVED: 'reserved',
  REPLAY: 'replay',
  PROCESSING: 'processing',
  CONFLICT: 'conflict',
  EXPIRED: 'expired',
} as const;

export type IdempotencyReservationOutcome =
  (typeof IDEMPOTENCY_RESERVATION_OUTCOMES)[keyof typeof IDEMPOTENCY_RESERVATION_OUTCOMES];

export interface IdempotencyScope {
  readonly tenantId: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly idempotencyKeyHash: string;
  readonly requestIntentHash: string;
}

interface BaseIdempotencyRecord {
  readonly id: string;
  readonly scope: IdempotencyScope;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date;
}

export interface ProcessingIdempotencyRecord extends BaseIdempotencyRecord {
  readonly status: typeof IDEMPOTENCY_STATUSES.PROCESSING;
}

export interface SucceededIdempotencyRecord<ResponseBody = unknown> extends BaseIdempotencyRecord {
  readonly status: typeof IDEMPOTENCY_STATUSES.SUCCEEDED;
  readonly responseStatusCode: number;
  readonly responseBody: ResponseBody;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly completedAt: Date;
}

export interface FailedIdempotencyRecord extends BaseIdempotencyRecord {
  readonly status: typeof IDEMPOTENCY_STATUSES.FAILED;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly completedAt: Date;
}

export interface ExpiredIdempotencyRecord extends BaseIdempotencyRecord {
  readonly status: typeof IDEMPOTENCY_STATUSES.EXPIRED;
  readonly expiredAt: Date;
}

export type IdempotencyRecord<ResponseBody = unknown> =
  | ProcessingIdempotencyRecord
  | SucceededIdempotencyRecord<ResponseBody>
  | FailedIdempotencyRecord
  | ExpiredIdempotencyRecord;

export interface ReserveIdempotencyInput {
  readonly scope: IdempotencyScope;
  readonly now: Date;
  readonly expiresAt: Date;
}

export type ReserveIdempotencyResult<ResponseBody = unknown> =
  | {
      readonly outcome: typeof IDEMPOTENCY_RESERVATION_OUTCOMES.RESERVED;
      readonly record: ProcessingIdempotencyRecord;
    }
  | {
      readonly outcome: typeof IDEMPOTENCY_RESERVATION_OUTCOMES.REPLAY;
      readonly record: SucceededIdempotencyRecord<ResponseBody>;
    }
  | {
      readonly outcome: typeof IDEMPOTENCY_RESERVATION_OUTCOMES.PROCESSING;
      readonly record: ProcessingIdempotencyRecord;
    }
  | {
      readonly outcome: typeof IDEMPOTENCY_RESERVATION_OUTCOMES.CONFLICT;
      readonly record: IdempotencyRecord<ResponseBody>;
    }
  | {
      readonly outcome: typeof IDEMPOTENCY_RESERVATION_OUTCOMES.EXPIRED;
      readonly record: ExpiredIdempotencyRecord;
    };

export interface MarkIdempotencySucceededInput<ResponseBody = unknown> {
  readonly scope: IdempotencyScope;
  readonly responseStatusCode: number;
  readonly responseBody: ResponseBody;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly completedAt: Date;
}

export interface MarkIdempotencyFailedInput {
  readonly scope: IdempotencyScope;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly completedAt: Date;
}

export abstract class IdempotencyStore {
  abstract reserve<ResponseBody = unknown>(
    input: ReserveIdempotencyInput,
  ): Promise<ReserveIdempotencyResult<ResponseBody>>;

  abstract markSucceeded<ResponseBody = unknown>(
    input: MarkIdempotencySucceededInput<ResponseBody>,
  ): Promise<SucceededIdempotencyRecord<ResponseBody>>;

  abstract markFailed(input: MarkIdempotencyFailedInput): Promise<FailedIdempotencyRecord>;
}
