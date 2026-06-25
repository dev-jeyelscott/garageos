import { Module } from '@nestjs/common';

import { API_DATABASE_CLIENT } from './database-client';
import { PostgresDatabaseClient } from './postgres-database-client';

@Module({
  providers: [
    PostgresDatabaseClient,
    {
      provide: API_DATABASE_CLIENT,
      useExisting: PostgresDatabaseClient,
    },
  ],
  exports: [API_DATABASE_CLIENT],
})
export class DatabaseModule {}
