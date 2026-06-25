import type { DatabaseQueryClient } from './database-client';

export const API_TRANSACTION_RUNNER = Symbol('API_TRANSACTION_RUNNER');

export type DatabaseTransactionWork<Result> = (transaction: DatabaseQueryClient) => Promise<Result>;

export interface DatabaseTransactionRunner {
  runInTransaction<Result>(work: DatabaseTransactionWork<Result>): Promise<Result>;
}
