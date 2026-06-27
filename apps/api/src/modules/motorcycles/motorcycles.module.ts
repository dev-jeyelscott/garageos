import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { MotorcyclesController } from './api/motorcycles.controller';
import { MotorcyclesService } from './application/motorcycles.service';
import { MOTORCYCLE_PROVIDERS } from './motorcycle.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [MotorcyclesController],
  providers: [MotorcyclesService, ...MOTORCYCLE_PROVIDERS],
})
export class MotorcyclesModule {}
