import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { PlatformTenantController } from './api/platform-tenant.controller';
import { PlatformTenantService } from './application/platform-tenant.service';
import { PLATFORM_TENANT_PROVIDERS } from './platform-tenant.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [PlatformTenantController],
  providers: [PlatformTenantService, ...PLATFORM_TENANT_PROVIDERS],
})
export class PlatformModule {}
