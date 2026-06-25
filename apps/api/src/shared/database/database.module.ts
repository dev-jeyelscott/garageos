import { Module } from '@nestjs/common';

import { API_DATABASE_CLIENT } from './database-client';
import { API_TRANSACTION_RUNNER } from './database-transaction';
import { PostgresDatabaseClient } from './postgres-database-client';
import { PostgresDatabaseTransactionRunner } from './postgres-database-transaction-runner';
import { AUTH_DATABASE_CLIENT_PROVIDER } from '../../modules/auth/persistence/database-client';

@Module({
  providers: [
    PostgresDatabaseClient,
    PostgresDatabaseTransactionRunner,
    {
      provide: API_DATABASE_CLIENT,
      useExisting: PostgresDatabaseClient,
    },
    {
      provide: API_TRANSACTION_RUNNER,
      useExisting: PostgresDatabaseTransactionRunner,
    },
    AUTH_DATABASE_CLIENT_PROVIDER,
  ],
  exports: [API_DATABASE_CLIENT, API_TRANSACTION_RUNNER, AUTH_DATABASE_CLIENT_PROVIDER],
})
export class DatabaseModule {}
