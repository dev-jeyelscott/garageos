import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import type { DatabaseQueryClient, DatabaseQueryResult } from './database-client';

export const DATABASE_URL_ENV_VAR = 'DATABASE_URL';

@Injectable()
export class PostgresDatabaseClient implements DatabaseQueryClient, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = getRequiredDatabaseUrl(process.env);

    this.pool = new Pool({
      connectionString,
    });
  }

  async query<Row>(text: string, values?: readonly unknown[]): Promise<DatabaseQueryResult<Row>> {
    const result = await this.pool.query(text, values === undefined ? undefined : [...values]);

    return {
      rows: result.rows as Row[],
      rowCount: result.rowCount,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function getRequiredDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const databaseUrl = environment[DATABASE_URL_ENV_VAR]?.trim();

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error(`${DATABASE_URL_ENV_VAR} is required to initialize the API database client.`);
  }

  return databaseUrl;
}
    