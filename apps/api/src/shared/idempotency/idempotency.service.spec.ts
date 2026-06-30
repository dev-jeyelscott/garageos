import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../database/database-client';
import type { DatabaseTransactionRunner } from '../database/database-transaction';
import type {
  IdempotencyKeyRecord,
  CreateProcessingIdempotencyKeyInput,
  FindActiveIdempotencyKeyInput,
  LockIdempotencyScopeInput,
  MarkIdempotencyKeyFailedInput,
  MarkIdempotencyKeySucceededInput,
} from './idempotency-key.store';
import { IDEMPOTENCY_STATUSES, IdempotencyKeyStore } from './idempotency-key.store';
import type { IdempotencyBeginResult } from './idempotency.service';
import { IdempotencyService } from './idempotency.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = 'POST /api/v1/invoices/33333333-3333-4333-8333-333333333333/payments';
const NOW = new Date('2026-06-26T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-06-27T00:00:00.000Z');

describe('IdempotencyService', () => {
  it('creates a processing record using hashed key and stable request intent hash', async () => {
    const { service, store } = createService();

    const result = expectStarted(
      await service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-1',
        requestIntent: {
          invoice_id: '33333333-3333-4333-8333-333333333333',
          amount: '100.00',
        },
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    );

    expect(store.locks).toHaveLength(1);
    expect(result.record.status).toBe(IDEMPOTENCY_STATUSES.PROCESSING);
    expect(result.record.tenantId).toBe(TENANT_ID);
    expect(result.record.userId).toBe(USER_ID);
    expect(result.record.endpoint).toBe(ENDPOINT);
    expect(result.record.idempotencyKeyHash).not.toBe('payment-key-1');
    expect(result.record.idempotencyKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.record.requestIntentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('replays a succeeded response for the same key and same request intent', async () => {
    const { service } = createService();

    const first = expectStarted(
      await service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-2',
        requestIntent: {
          amount: '100.00',
          invoice_id: '33333333-3333-4333-8333-333333333333',
        },
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    );

    await service.completeSucceeded({
      id: first.record.id,
      responseStatusCode: 201,
      responseBodyJson: {
        payment_id: '44444444-4444-4444-8444-444444444444',
      },
      now: NOW,
    });

    const replayed = await service.begin({
      tenantId: TENANT_ID,
      userId: USER_ID,
      endpoint: ENDPOINT,
      idempotencyKey: 'payment-key-2',
      requestIntent: {
        invoice_id: '33333333-3333-4333-8333-333333333333',
        amount: '100.00',
      },
      now: NOW,
      expiresAt: EXPIRES_AT,
    });

    expect(replayed).toEqual({
      type: 'replayed',
      record: expect.objectContaining({
        id: first.record.id,
        status: IDEMPOTENCY_STATUSES.SUCCEEDED,
      }),
      responseStatusCode: 201,
      responseBodyJson: {
        payment_id: '44444444-4444-4444-8444-444444444444',
      },
    });
  });

  it('rejects the same key when the request intent differs', async () => {
    const { service } = createService();

    const first = expectStarted(
      await service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-3',
        requestIntent: {
          amount: '100.00',
        },
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    );

    await service.completeSucceeded({
      id: first.record.id,
      responseStatusCode: 201,
      responseBodyJson: {},
      now: NOW,
    });

    await expect(
      service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-3',
        requestIntent: {
          amount: '200.00',
        },
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });
  });

  it('rejects a duplicate request while the original request is still processing', async () => {
    const { service } = createService();

    await service.begin({
      tenantId: TENANT_ID,
      userId: USER_ID,
      endpoint: ENDPOINT,
      idempotencyKey: 'payment-key-4',
      requestIntent: {
        amount: '100.00',
      },
      now: NOW,
      expiresAt: EXPIRES_AT,
    });

    await expect(
      service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-4',
        requestIntent: {
          amount: '100.00',
        },
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });
  });

  it('marks a processing record as failed when the command fails', async () => {
    const { service, store } = createService();

    const first = expectStarted(
      await service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: 'payment-key-5',
        requestIntent: {},
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    );

    await service.completeFailed({
      id: first.record.id,
      now: NOW,
    });

    expect(store.findById(first.record.id)).toEqual(
      expect.objectContaining({
        status: IDEMPOTENCY_STATUSES.FAILED,
        responseStatusCode: null,
        responseBodyJson: null,
        lockedUntil: null,
      }),
    );
  });

  it('requires a non-empty Idempotency-Key header value', async () => {
    const { service } = createService();

    await expect(
      service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: '  ',
        requestIntent: {},
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toBeInstanceOf(GarageOsApiException);

    await expect(
      service.begin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: ENDPOINT,
        idempotencyKey: '  ',
        requestIntent: {},
        now: NOW,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
    });
  });
});

function createService(): {
  readonly service: IdempotencyService;
  readonly store: FakeIdempotencyKeyStore;
} {
  const store = new FakeIdempotencyKeyStore();

  return {
    service: new IdempotencyService(store, new FakeTransactionRunner()),
    store,
  };
}

function expectStarted(
  result: IdempotencyBeginResult,
): Extract<IdempotencyBeginResult, { type: 'started' }> {
  if (result.type !== 'started') {
    throw new Error('Expected idempotency to start processing.');
  }

  return result;
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
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work(FAKE_DATABASE_CLIENT);
  }
}

class FakeIdempotencyKeyStore extends IdempotencyKeyStore {
  readonly locks: string[] = [];
  private readonly records: IdempotencyKeyRecord[] = [];

  async lockScope(input: LockIdempotencyScopeInput): Promise<void> {
    this.locks.push(input.lockKey);
  }

  async findActiveByScopeAndKeyHash(
    input: FindActiveIdempotencyKeyInput,
  ): Promise<IdempotencyKeyRecord | null> {
    return (
      this.records.find((record) => {
        return (
          record.tenantId === input.tenantId &&
          record.userId === input.userId &&
          record.endpoint === input.endpoint &&
          record.idempotencyKeyHash === input.idempotencyKeyHash &&
          record.status !== IDEMPOTENCY_STATUSES.EXPIRED &&
          record.expiresAt.getTime() > input.now.getTime()
        );
      }) ?? null
    );
  }

  async createProcessing(
    input: CreateProcessingIdempotencyKeyInput,
  ): Promise<IdempotencyKeyRecord> {
    const record: IdempotencyKeyRecord = {
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      endpoint: input.endpoint,
      requestIntentHash: input.requestIntentHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      status: IDEMPOTENCY_STATUSES.PROCESSING,
      responseStatusCode: null,
      responseBodyJson: null,
      lockedUntil: input.lockedUntil,
      createdAt: NOW,
      expiresAt: input.expiresAt,
    };

    this.records.push(record);

    return record;
  }

  async markSucceeded(input: MarkIdempotencyKeySucceededInput): Promise<void> {
    this.replaceRecord(input.id, (record) => ({
      ...record,
      status: IDEMPOTENCY_STATUSES.SUCCEEDED,
      responseStatusCode: input.responseStatusCode,
      responseBodyJson: input.responseBodyJson,
      lockedUntil: null,
    }));
  }

  async markFailed(input: MarkIdempotencyKeyFailedInput): Promise<void> {
    this.replaceRecord(input.id, (record) => ({
      ...record,
      status: IDEMPOTENCY_STATUSES.FAILED,
      responseStatusCode: null,
      responseBodyJson: null,
      lockedUntil: null,
    }));
  }

  findById(id: string): IdempotencyKeyRecord | null {
    return this.records.find((record) => record.id === id) ?? null;
  }

  private replaceRecord(
    id: string,
    replace: (record: IdempotencyKeyRecord) => IdempotencyKeyRecord,
  ): void {
    const index = this.records.findIndex((record) => record.id === id);

    if (index === -1) {
      throw new Error(`Idempotency record ${id} not found.`);
    }

    const existing = this.records[index];

    if (existing === undefined) {
      throw new Error(`Idempotency record ${id} not found.`);
    }

    this.records[index] = replace(existing);
  }
}
