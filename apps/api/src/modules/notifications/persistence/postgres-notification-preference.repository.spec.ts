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
      "select pg_advisory_xact_lock( hashtextextended($1::text || ':' || $2::text || ':notification_preferences', 0) )",
    );
    expect(client.queries[0]?.values).toEqual([TENANT_ID, USER_ID]);
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

  it('serializes concurrent replacements for the same tenant and user before mutation', async () => {
    const client = new SerializingDatabaseClient();
    const repository = new PostgresNotificationPreferenceRepository(client);

    const first = repository.replaceForUser(
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
        ],
      },
      client,
    );
    const second = repository.replaceForUser(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        updatedAt: UPDATED_AT,
        preferences: [
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

    await client.waitForBlockedLock();
    await client.waitForFirstReplacementPaused();

    expect(client.mutationOrder).toEqual(['lock-acquired:1', 'delete:1', 'insert:1']);

    client.releaseFirstReplacement();

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(client.mutationOrder).toEqual([
      'lock-acquired:1',
      'delete:1',
      'insert:1',
      'select:1',
      'lock-acquired:2',
      'delete:2',
      'insert:2',
      'select:2',
    ]);
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

class SerializingDatabaseClient implements DatabaseQueryClient {
  readonly mutationOrder: string[] = [];

  private activeReplacement = 0;
  private nextReplacementId = 0;
  private blockedLockObserved = false;
  private blockedLockResolver: (() => void) | null = null;
  private firstReplacementPaused = false;
  private firstReplacementPausedResolver: (() => void) | null = null;
  private firstReplacementRelease: (() => void) | null = null;

  async query<Row extends DatabaseRow = DatabaseRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.includes('pg_advisory_xact_lock')) {
      return this.acquirePreferenceLock<Row>(values);
    }

    if (normalizedSql.includes('delete from user_notification_preferences')) {
      this.mutationOrder.push(`delete:${this.activeReplacement}`);

      return emptyResult<Row>();
    }

    if (normalizedSql.includes('insert into user_notification_preferences')) {
      this.mutationOrder.push(`insert:${this.activeReplacement}`);

      if (this.activeReplacement === 1) {
        this.firstReplacementPaused = true;
        this.firstReplacementPausedResolver?.();

        await new Promise<void>((resolve) => {
          this.firstReplacementRelease = resolve;
        });
      }

      return emptyResult<Row>();
    }

    if (normalizedSql.includes('from user_notification_preferences')) {
      this.mutationOrder.push(`select:${this.activeReplacement}`);
      this.activeReplacement = 0;

      return emptyResult<Row>();
    }

    return emptyResult<Row>();
  }

  waitForBlockedLock(): Promise<void> {
    if (this.blockedLockObserved) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.blockedLockResolver = resolve;
    });
  }

  waitForFirstReplacementPaused(): Promise<void> {
    if (this.firstReplacementPaused) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.firstReplacementPausedResolver = resolve;
    });
  }

  releaseFirstReplacement(): void {
    this.firstReplacementRelease?.();
  }

  private async acquirePreferenceLock<Row extends DatabaseRow>(
    values: readonly unknown[] | undefined,
  ): Promise<DatabaseQueryResult<Row>> {
    expect(values).toEqual([TENANT_ID, USER_ID]);

    if (this.activeReplacement !== 0) {
      this.blockedLockObserved = true;
      this.blockedLockResolver?.();

      while (this.activeReplacement !== 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    this.nextReplacementId += 1;
    this.activeReplacement = this.nextReplacementId;
    this.mutationOrder.push(`lock-acquired:${this.activeReplacement}`);

    return emptyResult<Row>();
  }
}

function emptyResult<Row extends DatabaseRow>(): DatabaseQueryResult<Row> {
  return {
    rows: [],
    rowCount: 0,
  };
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
