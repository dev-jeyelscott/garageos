import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { ServicesController } from './api/services.controller';
import { ServicesService } from './application/services.service';
import { SERVICE_PROVIDERS } from './service.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ServicesController],
  providers: [ServicesService, ...SERVICE_PROVIDERS],
})
export class ServicesModule {}
