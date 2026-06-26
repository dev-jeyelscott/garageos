import { Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './shared/audit/audit.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';

@Module({
  imports: [AuthModule, AuditModule, IdempotencyModule],
})
export class AppModule {}
