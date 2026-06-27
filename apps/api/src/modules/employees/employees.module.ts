import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { EmployeesController } from './api/employees.controller';
import { EmployeesService } from './application/employees.service';
import { EMPLOYEE_PROVIDERS } from './employee.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, ...EMPLOYEE_PROVIDERS],
})
export class EmployeesModule {}
