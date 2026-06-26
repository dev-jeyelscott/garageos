import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuditLogStore } from './audit-log.store';
import { AuditService } from './audit.service';
import { PostgresAuditLogRepository } from './postgres-audit-log.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuditService,
    {
      provide: AuditLogStore,
      useClass: PostgresAuditLogRepository,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
