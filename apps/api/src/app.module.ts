import { Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';

@Module({
  imports: [AuthModule, IdempotencyModule],
})
export class AppModule {}
