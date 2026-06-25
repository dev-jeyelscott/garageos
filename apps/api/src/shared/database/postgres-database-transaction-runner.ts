import { Inject, Injectable } from '@nestjs/common';

import { API_DATABASE_CLIENT, type DatabaseConnectionProvider } from './database-client';
import type { DatabaseTransactionRunner, DatabaseTransactionWork } from './database-transaction';

@Injectable()
export class PostgresDatabaseTransactionRunner implements DatabaseTransactionRunner {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseConnectionProvider,
  ) {}

  async runInTransaction<Result>(work: DatabaseTransactionWork<Result>): Promise<Result> {
    const connection = await this.database.connect();

    try {
      await connection.query('begin');

      const result = await work(connection);

      await connection.query('commit');

      return result;
    } catch (error) {
      try {
        await connection.query('rollback');
      } catch (rollbackError) {
        void rollbackError;
      }

      throw error;
    } finally {
      connection.release();
    }
  }
}
