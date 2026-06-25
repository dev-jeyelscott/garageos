import { Inject, Injectable } from '@nestjs/common';

import type {
  CountAuthRateLimitEventsInput,
  RecordAuthRateLimitEventInput,
} from '../application/auth-rate-limit.store';
import { AuthRateLimitStore } from '../application/auth-rate-limit.store';
import { AUTH_DATABASE_CLIENT, type DatabaseQueryClient } from './database-client';

interface CountRow {
  readonly count: string;
}

@Injectable()
export class PostgresAuthRateLimitRepository extends AuthRateLimitStore {
  constructor(
    @Inject(AUTH_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async countEvents(input: CountAuthRateLimitEventsInput): Promise<number> {
    const result = await this.database.query<CountRow>(
      `
        select count(*)::text as count
        from rate_limit_events
        where endpoint_category = $1
          and key = $2
          and occurred_at >= $3::timestamptz
      `,
      [input.bucket, input.key, input.since],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async recordEvent(input: RecordAuthRateLimitEventInput): Promise<void> {
    await this.database.query(
      `
        insert into rate_limit_events (
          tenant_id,
          user_id,
          key,
          endpoint_category,
          ip_address,
          metadata_json
        )
        values ($1, $2, $3, $4, $5::inet, $6::jsonb)
      `,
      [
        input.tenantId ?? null,
        input.userId ?? null,
        input.key,
        input.bucket,
        input.ipAddress ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
