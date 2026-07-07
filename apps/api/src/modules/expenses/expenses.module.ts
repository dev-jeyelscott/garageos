import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { ExpensesController } from './api/expenses.controller';
import { ExpensesService } from './application/expenses.service';
import { EXPENSE_PROVIDERS } from './expense.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ...EXPENSE_PROVIDERS],
})
export class ExpensesModule {}
