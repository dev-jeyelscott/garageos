import { describe, expect, it } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresNotificationPreferenceRepository } from './postgres-notification-preference.repository';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = new Date('2026-07-08T00:00:00.000Z');

describe('PostgresNotificationPreferenceRepository', () => {
  it('serializes user preference replacement and batches inserted rows', async () => {
    const client = new RecordingDatabaseClient([
      [],
      [],
      [],
      [
        createPreferenceRow({
          notification_type: 'assignment',
          channel: 'email',
          enabled: false,
        }),
        createPreferenceRow({
          notification_type: 'low_stock',
          channel: 'in_app',
          enabled: true,
        }),
      ],
    ]);
    const repository = new PostgresNotificationPreferenceRepository(client);

    const result = await repository.replaceForUser(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        updatedAt: UPDATED_AT,
        preferences: [
          {
            notificationType: 'low_stock',
            channel: 'in_app',
            enabled: true,
            updatedAt: UPDATED_AT,
          },
          {
            notificationType: 'assignment',
            channel: 'email',
            enabled: false,
            updatedAt: UPDATED_AT,
          },
        ],
      },
      client,
    );

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toBe(
      'select pg_advisory_xact_lock(hashtextextended($1, 0))',
    );
    expect(client.queries[0]?.values).toEqual([`notification-preferences:${TENANT_ID}:${USER_ID}`]);
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain(
      'delete from user_notification_preferences',
    );

    const insertQuery = client.queries[2];
    expect(normalizeSql(insertQuery?.sql ?? '')).toContain(
      'insert into user_notification_preferences',
    );
    expect(normalizeSql(insertQuery?.sql ?? '')).toContain(
      'values ($1, $2, $3, $4, $5, $6, $6), ($7, $8, $9, $10, $11, $12, $12)',
    );
    expect(insertQuery?.values).toEqual([
      TENANT_ID,
      USER_ID,
      'low_stock',
      'in_app',
      true,
      UPDATED_AT,
      TENANT_ID,
      USER_ID,
      'assignment',
      'email',
      false,
      UPDATED_AT,
    ]);
    expect(normalizeSql(client.queries[3]?.sql ?? '')).toContain(
      'from user_notification_preferences',
    );
    expect(result).toEqual([
      {
        notificationType: 'assignment',
        channel: 'email',
        enabled: false,
        updatedAt: UPDATED_AT,
      },
      {
        notificationType: 'low_stock',
        channel: 'in_app',
        enabled: true,
        updatedAt: UPDATED_AT,
      },
    ]);
  });

  it('skips the batched insert when replacement input is empty', async () => {
    const client = new RecordingDatabaseClient([[], [], []]);
    const repository = new PostgresNotificationPreferenceRepository(client);

    const result = await repository.replaceForUser(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        updatedAt: UPDATED_AT,
        preferences: [],
      },
      client,
    );

    expect(client.queries).toHaveLength(3);
    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('pg_advisory_xact_lock');
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain(
      'delete from user_notification_preferences',
    );
    expect(normalizeSql(client.queries[2]?.sql ?? '')).toContain(
      'from user_notification_preferences',
    );
    expect(result).toEqual([]);
  });
});

class RecordingDatabaseClient implements DatabaseQueryClient {
  readonly queries: {
    readonly sql: string;
    readonly values: readonly unknown[] | undefined;
  }[] = [];

  private index = 0;

  constructor(private readonly rowSets: readonly (readonly DatabaseRow[])[]) {}

  async query<Row extends DatabaseRow = DatabaseRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.queries.push({ sql, values });
    const rows = this.rowSets[this.index] ?? [];
    this.index += 1;

    return {
      rows: rows as readonly Row[],
      rowCount: rows.length,
    };
  }
}

function createPreferenceRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    notification_type: 'low_stock',
    channel: 'in_app',
    enabled: true,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
