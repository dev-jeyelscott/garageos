import { Inject, Injectable } from '@nestjs/common';

import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationTokenRecord,
} from '../application/email-verification-token.store';
import { EmailVerificationTokenStore } from '../application/email-verification-token.store';
import {
  AUTH_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from './database-client';

interface EmailVerificationTokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly token_hash: string;
  readonly email: string;
  readonly expires_at: Date | string;
  readonly used_at: Date | string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresEmailVerificationTokenRepository extends EmailVerificationTokenStore {
  constructor(
    @Inject(AUTH_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    const result = await this.database.query<EmailVerificationTokenRow>(
      `
        insert into email_verification_tokens (
          id,
          user_id,
          token_hash,
          email,
          expires_at
        )
        values ($1, $2, $3, $4, $5)
        returning
          id,
          user_id,
          token_hash,
          email,
          expires_at,
          used_at,
          created_at
      `,
      [input.id, input.userId, input.tokenHash, input.email, input.expiresAt],
    );

    return mapEmailVerificationTokenRow(getRequiredRow(result, 'create email verification token'));
  }

  async consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<EmailVerificationTokenRecord | null> {
    const result = await this.database.query<EmailVerificationTokenRow>(
      `
        update email_verification_tokens
        set used_at = $2
        where token_hash = $1
          and used_at is null
          and expires_at > $2::timestamptz
        returning
          id,
          user_id,
          token_hash,
          email,
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

    return mapEmailVerificationTokenRow(row);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Email verification token repository failed to ${operation}.`);
  }

  return row;
}

function mapEmailVerificationTokenRow(
  row: EmailVerificationTokenRow,
): EmailVerificationTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    email: row.email,
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
