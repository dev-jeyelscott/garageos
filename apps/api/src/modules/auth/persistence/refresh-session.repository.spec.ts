import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient, DatabaseQueryResult } from './database-client';
import { PostgresRefreshSessionRepository } from './refresh-session.repository';

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

class FakeDatabaseQueryClient implements DatabaseQueryClient {
  readonly calls: QueryCall[] = [];
  private responses: DatabaseQueryResult<unknown>[] = [];

  enqueueRows<Row>(rows: readonly Row[]): void {
    this.responses.push({
      rows,
      rowCount: rows.length,
    });
  }

  async query<Row>(text: string, values?: readonly unknown[]): Promise<DatabaseQueryResult<Row>> {
    this.calls.push({
      text,
      values,
    });

    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error('Missing fake database response.');
    }

    return response as DatabaseQueryResult<Row>;
  }
}

describe('PostgresRefreshSessionRepository', () => {
  it('creates a refresh session using the documented refresh_sessions columns', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    const expiresAt = new Date('2026-07-25T00:00:00.000Z');
    const createdAt = new Date('2026-06-25T00:00:00.000Z');

    database.enqueueRows([
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        tenant_id: '33333333-3333-4333-8333-333333333333',
        token_family_id: '44444444-4444-4444-8444-444444444444',
        refresh_token_hash: 'refresh-token-hash',
        remember_me: true,
        expires_at: expiresAt,
        revoked_at: null,
        replaced_by_session_id: null,
        created_at: createdAt,
      },
    ]);

    const record = await repository.create({
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: '33333333-3333-4333-8333-333333333333',
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'refresh-token-hash',
      rememberMe: true,
      expiresAt,
    });

    const call = getOnlyCall(database);

    expect(call.text).toContain('insert into refresh_sessions');
    expect(call.text).toContain('refresh_token_hash');
    expect(call.values).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      'refresh-token-hash',
      true,
      expiresAt,
    ]);

    expect(record).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: '33333333-3333-4333-8333-333333333333',
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'refresh-token-hash',
      rememberMe: true,
      expiresAt,
      revokedAt: null,
      replacedBySessionId: null,
      createdAt,
    });
  });

  it('finds an active refresh session by hashed token only when it is unrevoked and unexpired', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    const now = new Date('2026-06-25T00:00:00.000Z');

    database.enqueueRows([
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        tenant_id: null,
        token_family_id: '44444444-4444-4444-8444-444444444444',
        refresh_token_hash: 'refresh-token-hash',
        remember_me: false,
        expires_at: '2026-06-25T01:00:00.000Z',
        revoked_at: null,
        replaced_by_session_id: null,
        created_at: '2026-06-24T00:00:00.000Z',
      },
    ]);

    const record = await repository.findActiveByRefreshTokenHash('refresh-token-hash', now);

    const call = getOnlyCall(database);

    expect(call.text).toContain('from refresh_sessions');
    expect(call.text).toContain('refresh_token_hash = $1');
    expect(call.text).toContain('revoked_at is null');
    expect(call.text).toContain('expires_at > $2::timestamptz');
    expect(call.values).toEqual(['refresh-token-hash', now]);

    expect(record).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: null,
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'refresh-token-hash',
      rememberMe: false,
      expiresAt: new Date('2026-06-25T01:00:00.000Z'),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
    });
  });

  it('returns null when no active refresh session matches the hashed token', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    database.enqueueRows([]);

    await expect(
      repository.findActiveByRefreshTokenHash(
        'missing-refresh-token-hash',
        new Date('2026-06-25T00:00:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it('marks a refresh session as replaced during rotation', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    const revokedAt = new Date('2026-06-25T00:00:00.000Z');

    database.enqueueRows([]);

    await repository.markReplaced({
      currentSessionId: '11111111-1111-4111-8111-111111111111',
      replacementSessionId: '22222222-2222-4222-8222-222222222222',
      revokedAt,
    });

    const call = getOnlyCall(database);

    expect(call.text).toContain('update refresh_sessions');
    expect(call.text).toContain('revoked_at = $3');
    expect(call.text).toContain('replaced_by_session_id = $2');
    expect(call.text).toContain('where id = $1');
    expect(call.text).toContain('revoked_at is null');
    expect(call.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      revokedAt,
    ]);
  });

  it('revokes the current device refresh session', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    const revokedAt = new Date('2026-06-25T00:00:00.000Z');

    database.enqueueRows([]);

    await repository.revokeCurrentDevice('11111111-1111-4111-8111-111111111111', revokedAt);

    const call = getOnlyCall(database);

    expect(call.text).toContain('update refresh_sessions');
    expect(call.text).toContain('set revoked_at = $2');
    expect(call.text).toContain('where id = $1');
    expect(call.text).toContain('revoked_at is null');
    expect(call.values).toEqual(['11111111-1111-4111-8111-111111111111', revokedAt]);
  });

  it('revokes all active refresh sessions for a user', async () => {
    const database = new FakeDatabaseQueryClient();
    const repository = new PostgresRefreshSessionRepository(database);

    const revokedAt = new Date('2026-06-25T00:00:00.000Z');

    database.enqueueRows([]);

    await repository.revokeAllForUser('11111111-1111-4111-8111-111111111111', revokedAt);

    const call = getOnlyCall(database);

    expect(call.text).toContain('update refresh_sessions');
    expect(call.text).toContain('set revoked_at = $2');
    expect(call.text).toContain('where user_id = $1');
    expect(call.text).toContain('revoked_at is null');
    expect(call.values).toEqual(['11111111-1111-4111-8111-111111111111', revokedAt]);
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
