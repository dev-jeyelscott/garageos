import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialReportsController } from './api/financial-reports.controller';
import { FinancialReportsService } from './application/financial-reports.service';
import { REPORT_PROVIDERS } from './report.providers';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  controllers: [FinancialReportsController],
  providers: [FinancialReportsService, ...REPORT_PROVIDERS],
})
export class ReportsModule {}
