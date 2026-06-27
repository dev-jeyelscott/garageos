import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { BranchController } from './api/branch.controller';
import { BranchService } from './application/branch.service';
import { BRANCH_PROVIDERS } from './branch.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [BranchController],
  providers: [BranchService, ...BRANCH_PROVIDERS],
  exports: [BranchService],
})
export class BranchModule {}
