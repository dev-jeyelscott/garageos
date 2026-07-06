import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { ExpenseCategoriesController } from './api/expense-categories.controller';
import { ExpenseCategoriesService } from './application/expense-categories.service';
import { EXPENSE_CATEGORY_PROVIDERS } from './expense-category.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ExpenseCategoriesController],
  providers: [ExpenseCategoriesService, ...EXPENSE_CATEGORY_PROVIDERS],
})
export class ExpenseCategoriesModule {}
