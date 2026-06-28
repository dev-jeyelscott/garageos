import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { MechanicSessionsController } from './api/mechanic-sessions.controller';
import { MechanicSessionsService } from './application/mechanic-sessions.service';
import { MECHANIC_SESSION_PROVIDERS } from './mechanic-session.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [MechanicSessionsController],
  providers: [MechanicSessionsService, ...MECHANIC_SESSION_PROVIDERS],
})
export class MechanicSessionsModule {}
