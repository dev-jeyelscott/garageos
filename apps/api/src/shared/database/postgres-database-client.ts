import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import type {
  DatabaseConnection,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow,
} from './database-client';

export const DATABASE_URL_ENV_VAR = 'DATABASE_URL';

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

@Injectable()
export class PostgresDatabaseClient implements DatabaseConnectionProvider, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: resolveRequiredDatabaseUrl(),
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

export function resolveRequiredDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  const databaseUrl = env[DATABASE_URL_ENV_VAR]?.trim();

  if (!databaseUrl) {
    throw new Error(
      `${DATABASE_URL_ENV_VAR} is required. Set it to a PostgreSQL connection URL before starting the API.`,
    );
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error(`${DATABASE_URL_ENV_VAR} must be a valid PostgreSQL connection URL.`);
  }

  if (!POSTGRES_PROTOCOLS.has(parsedDatabaseUrl.protocol)) {
    throw new Error(`${DATABASE_URL_ENV_VAR} must use the postgres:// or postgresql:// protocol.`);
  }

  return databaseUrl;
}

function toPgQueryValues(values: readonly unknown[] | undefined): unknown[] | undefined {
  return values === undefined ? undefined : [...values];
}
