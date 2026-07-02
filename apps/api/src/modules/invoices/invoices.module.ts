import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { InvoicesController } from './api/invoices.controller';
import { INVOICE_PROVIDERS } from './invoice.providers';
import { InvoicesService } from './application/invoices.service';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, ...INVOICE_PROVIDERS],
  exports: [...INVOICE_PROVIDERS],
})
export class InvoicesModule {}
