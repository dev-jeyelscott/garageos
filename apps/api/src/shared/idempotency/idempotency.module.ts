import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { IdempotencyKeyStore } from './idempotency-key.store';
import { IdempotencyService } from './idempotency.service';
import { PostgresIdempotencyKeyRepository } from './postgres-idempotency-key.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    IdempotencyService,
    {
      provide: IdempotencyKeyStore,
      useClass: PostgresIdempotencyKeyRepository,
    },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
