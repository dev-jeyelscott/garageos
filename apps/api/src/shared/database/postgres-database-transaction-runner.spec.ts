import { describe, expect, it } from 'vitest';

import type {
  DatabaseConnection,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow,
} from './database-client';
import { PostgresDatabaseTransactionRunner } from './postgres-database-transaction-runner';

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

class FakeDatabaseConnection implements DatabaseConnection {
  readonly calls: QueryCall[] = [];
  released = false;

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.calls.push({ text, values });

    return {
      rows: [],
      rowCount: 0,
    };
  }

  release(): void {
    this.released = true;
  }
}

class FakeDatabaseConnectionProvider implements DatabaseConnectionProvider {
  readonly rootCalls: QueryCall[] = [];
  readonly connection = new FakeDatabaseConnection();

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.rootCalls.push({ text, values });

    return {
      rows: [],
      rowCount: 0,
    };
  }

  async connect(): Promise<DatabaseConnection> {
    return this.connection;
  }
}

describe('PostgresDatabaseTransactionRunner', () => {
  it('runs work inside a transaction and commits on success', async () => {
    const database = new FakeDatabaseConnectionProvider();
    const runner = new PostgresDatabaseTransactionRunner(database);

    const result = await runner.runInTransaction(async (transaction) => {
      await transaction.query('select $1::text as value', ['ok']);

      return 'done';
    });

    expect(result).toBe('done');
    expect(database.connection.calls).toEqual([
      { text: 'begin', values: undefined },
      { text: 'select $1::text as value', values: ['ok'] },
      { text: 'commit', values: undefined },
    ]);
    expect(database.connection.released).toBe(true);
  });

  it('rolls back and releases the connection when work fails', async () => {
    const database = new FakeDatabaseConnectionProvider();
    const runner = new PostgresDatabaseTransactionRunner(database);

    await expect(
      runner.runInTransaction(async (transaction) => {
        await transaction.query('insert into example values ($1)', ['bad']);

        throw new Error('command failed');
      }),
    ).rejects.toThrow('command failed');

    expect(database.connection.calls).toEqual([
      { text: 'begin', values: undefined },
      { text: 'insert into example values ($1)', values: ['bad'] },
      { text: 'rollback', values: undefined },
    ]);
    expect(database.connection.released).toBe(true);
  });
});
