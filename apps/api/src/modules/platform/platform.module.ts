import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { BackgroundJobsModule } from '../../shared/background-jobs/background-jobs.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformTenantController } from './api/platform-tenant.controller';
import { PlatformTenantService } from './application/platform-tenant.service';
import { TenantLifecycleCommandService } from './application/tenant-lifecycle-command.service';
import { TenantLifecycleEvaluationService } from './application/tenant-lifecycle-evaluation.service';
import { PLATFORM_TENANT_PROVIDERS } from './platform-tenant.providers';

@Module({
  imports: [AuthModule, AuditModule, BackgroundJobsModule, DatabaseModule, IdempotencyModule],
  controllers: [PlatformTenantController],
  providers: [
    PlatformTenantService,
    TenantLifecycleEvaluationService,
    TenantLifecycleCommandService,
    ...PLATFORM_TENANT_PROVIDERS,
  ],
  exports: [TenantLifecycleCommandService],
})
export class PlatformModule {}
