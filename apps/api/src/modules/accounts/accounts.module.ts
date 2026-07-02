import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsPayableController } from './api/accounts-payable.controller';
import { AccountsPayableService } from './application/accounts-payable.service';
import { ACCOUNTS_PROVIDERS } from './accounts.providers';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService, ...ACCOUNTS_PROVIDERS],
  exports: [AccountsPayableService, ...ACCOUNTS_PROVIDERS],
})
export class AccountsModule {}
