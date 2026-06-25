import { Inject, Injectable } from '@nestjs/common';

import type {
  CreateRefreshSessionInput,
  RefreshSessionRecord,
  ReplaceRefreshSessionInput,
} from '../application/refresh-session.store';
import { RefreshSessionStore } from '../application/refresh-session.store';
import {
  AUTH_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
} from './database-client';

interface RefreshSessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string | null;
  readonly token_family_id: string;
  readonly refresh_token_hash: string;
  readonly remember_me: boolean;
  readonly expires_at: Date | string;
  readonly revoked_at: Date | string | null;
  readonly replaced_by_session_id: string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresRefreshSessionRepository extends RefreshSessionStore {
  constructor(
    @Inject(AUTH_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    const result = await this.database.query<RefreshSessionRow>(
      `
        insert into refresh_sessions (
          user_id,
          tenant_id,
          token_family_id,
          refresh_token_hash,
          remember_me,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          user_id,
          tenant_id,
          token_family_id,
          refresh_token_hash,
          remember_me,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
      `,
      [
        input.userId,
        input.tenantId,
        input.tokenFamilyId,
        input.refreshTokenHash,
        input.rememberMe,
        input.expiresAt,
      ],
    );

    return mapRefreshSessionRow(getRequiredRow(result, 'create refresh session'));
  }

  async findActiveByRefreshTokenHash(
    refreshTokenHash: string,
    now: Date,
  ): Promise<RefreshSessionRecord | null> {
    const result = await this.database.query<RefreshSessionRow>(
      `
        select
          id,
          user_id,
          tenant_id,
          token_family_id,
          refresh_token_hash,
          remember_me,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
        from refresh_sessions
        where refresh_token_hash = $1
          and revoked_at is null
          and expires_at > $2::timestamptz
        limit 1
      `,
      [refreshTokenHash, now],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return mapRefreshSessionRow(row);
  }

  async markReplaced(input: ReplaceRefreshSessionInput): Promise<void> {
    await this.database.query(
      `
        update refresh_sessions
        set
          revoked_at = $3,
          replaced_by_session_id = $2
        where id = $1
          and revoked_at is null
      `,
      [input.currentSessionId, input.replacementSessionId, input.revokedAt],
    );
  }

  async revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void> {
    await this.database.query(
      `
        update refresh_sessions
        set revoked_at = $2
        where id = $1
          and revoked_at is null
      `,
      [sessionId, revokedAt],
    );
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.database.query(
      `
        update refresh_sessions
        set revoked_at = $2
        where user_id = $1
          and revoked_at is null
      `,
      [userId, revokedAt],
    );
  }
}

function getRequiredRow<Row>(result: DatabaseQueryResult<Row>, operation: string): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Refresh session repository failed to ${operation}.`);
  }

  return row;
}

function mapRefreshSessionRow(row: RefreshSessionRow): RefreshSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    tokenFamilyId: row.token_family_id,
    refreshTokenHash: row.refresh_token_hash,
    rememberMe: row.remember_me,
    expiresAt: toDate(row.expires_at),
    revokedAt: toNullableDate(row.revoked_at),
    replacedBySessionId: row.replaced_by_session_id,
    createdAt: toDate(row.created_at),
  };
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
