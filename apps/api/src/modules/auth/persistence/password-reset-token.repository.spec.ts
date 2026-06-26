import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient, DatabaseQueryResult, DatabaseRow } from './database-client';
import { PostgresPasswordResetTokenRepository } from './password-reset-token.repository';

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

class FakeDatabaseQueryClient implements DatabaseQueryClient {
  readonly calls: QueryCall[] = [];
  private responses: DatabaseQueryResult<DatabaseRow>[] = [];

  enqueueRows<Row extends DatabaseRow = DatabaseRow>(rows: readonly Row[]): void {
    this.responses.push({
      rows,
      rowCount: rows.length,
    });
  }

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.calls.push({ text, values });

    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error('Missing fake database response.');
    }

    return response as DatabaseQueryResult<Row>;
  }
}

describe('PostgresPasswordResetTokenRepository', () => {
  it('creates a password reset token using hashed token storage', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresPasswordResetTokenRepository(database);

    const expiresAt = new Date('2026-06-26T10:30:00.000Z');
    const createdAt = new Date('2026-06-26T10:00:00.000Z');

    database.enqueueRows([
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        token_hash: 'reset-token-hash',
        expires_at: expiresAt,
        used_at: null,
        created_at: createdAt,
      },
    ]);

    const record = await repository.create({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tokenHash: 'reset-token-hash',
      expiresAt,
    });

    const call = getOnlyCall(database);

    expect(call.text).toContain('insert into password_reset_tokens');
    expect(call.text).toContain('token_hash');
    expect(call.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'reset-token-hash',
      expiresAt,
    ]);

    expect(record).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tokenHash: 'reset-token-hash',
      expiresAt,
      usedAt: null,
      createdAt,
    });
  });

  it('consumes only an unused, unexpired password reset token', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresPasswordResetTokenRepository(database);

    const consumedAt = new Date('2026-06-26T10:00:00.000Z');

    database.enqueueRows([
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        token_hash: 'reset-token-hash',
        expires_at: '2026-06-26T10:30:00.000Z',
        used_at: '2026-06-26T10:00:00.000Z',
        created_at: '2026-06-26T09:59:00.000Z',
      },
    ]);

    const record = await repository.consumeActiveByTokenHash('reset-token-hash', consumedAt);

    const call = getOnlyCall(database);

    expect(call.text).toContain('update password_reset_tokens');
    expect(call.text).toContain('set used_at = $2');
    expect(call.text).toContain('token_hash = $1');
    expect(call.text).toContain('used_at is null');
    expect(call.text).toContain('expires_at > $2::timestamptz');
    expect(call.values).toEqual(['reset-token-hash', consumedAt]);

    expect(record).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tokenHash: 'reset-token-hash',
      expiresAt: new Date('2026-06-26T10:30:00.000Z'),
      usedAt: consumedAt,
      createdAt: new Date('2026-06-26T09:59:00.000Z'),
    });
  });

  it('returns null when no active reset token can be consumed', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresPasswordResetTokenRepository(database);

    database.enqueueRows([]);

    await expect(
      repository.consumeActiveByTokenHash(
        'missing-reset-token-hash',
        new Date('2026-06-26T10:00:00.000Z'),
      ),
    ).resolves.toBeNull();
  });
});

function getOnlyCall(database: FakeDatabaseQueryClient): QueryCall {
  expect(database.calls).toHaveLength(1);

  const call = database.calls[0];

  if (call === undefined) {
    throw new Error('Expected one database call.');
  }

  return call;
}
