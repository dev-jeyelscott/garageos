import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { RoleController } from './api/role.controller';
import { RoleService } from './application/role.service';
import { ROLE_PROVIDERS } from './role.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [RoleController],
  providers: [RoleService, ...ROLE_PROVIDERS],
  exports: [RoleService],
})
export class RolesModule {}
