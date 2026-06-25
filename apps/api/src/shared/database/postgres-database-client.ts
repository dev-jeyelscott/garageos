import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import type {
  DatabaseConnection,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow,
} from './database-client';

export const DATABASE_URL_ENV_VAR = 'DATABASE_URL';

@Injectable()
export class PostgresDatabaseClient implements DatabaseConnectionProvider, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env[DATABASE_URL_ENV_VAR],
    });
  }

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    const result = await this.pool.query<Row>(text, toPgQueryValues(values));

    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  }

  async connect(): Promise<DatabaseConnection> {
    const client = await this.pool.connect();

    return {
      query: async <Row extends DatabaseRow = DatabaseRow>(
        text: string,
        values?: readonly unknown[],
      ): Promise<DatabaseQueryResult<Row>> => {
        const result = await client.query<Row>(text, toPgQueryValues(values));

        return {
          rows: result.rows,
          rowCount: result.rowCount,
        };
      },
      release: (): void => {
        client.release();
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function toPgQueryValues(values: readonly unknown[] | undefined): unknown[] | undefined {
  return values === undefined ? undefined : [...values];
}
