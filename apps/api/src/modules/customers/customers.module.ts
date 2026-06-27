import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './api/customers.controller';
import { CustomersService } from './application/customers.service';
import { CUSTOMER_PROVIDERS } from './customer.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [CustomersController],
  providers: [CustomersService, ...CUSTOMER_PROVIDERS],
})
export class CustomersModule {}
