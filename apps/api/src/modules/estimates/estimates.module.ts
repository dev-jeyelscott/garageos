import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { EstimatesController } from './api/estimates.controller';
import { EstimatesService } from './application/estimates.service';
import { ESTIMATE_PROVIDERS } from './estimate.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, ...ESTIMATE_PROVIDERS],
})
export class EstimatesModule {}
