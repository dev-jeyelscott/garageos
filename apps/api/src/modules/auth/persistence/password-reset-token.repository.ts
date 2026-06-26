import { Inject, Injectable } from '@nestjs/common';

import type {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRecord,
} from '../application/password-reset-token.store';
import { PasswordResetTokenStore } from '../application/password-reset-token.store';
import {
  AUTH_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from './database-client';

interface PasswordResetTokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly token_hash: string;
  readonly expires_at: Date | string;
  readonly used_at: Date | string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresPasswordResetTokenRepository extends PasswordResetTokenStore {
  constructor(
    @Inject(AUTH_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const result = await this.database.query<PasswordResetTokenRow>(
      `
        insert into password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at
        )
        values ($1, $2, $3, $4)
        returning
          id,
          user_id,
          token_hash,
          expires_at,
          used_at,
          created_at
      `,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );

    return mapPasswordResetTokenRow(getRequiredRow(result, 'create password reset token'));
  }

  async consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<PasswordResetTokenRecord | null> {
    const result = await this.database.query<PasswordResetTokenRow>(
      `
        update password_reset_tokens
        set used_at = $2
        where token_hash = $1
          and used_at is null
          and expires_at > $2::timestamptz
        returning
          id,
          user_id,
          token_hash,
          expires_at,
          used_at,
          created_at
      `,
      [tokenHash, consumedAt],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return mapPasswordResetTokenRow(row);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Password reset token repository failed to ${operation}.`);
  }

  return row;
}

function mapPasswordResetTokenRow(row: PasswordResetTokenRow): PasswordResetTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: toDate(row.expires_at),
    usedAt: toNullableDate(row.used_at),
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
