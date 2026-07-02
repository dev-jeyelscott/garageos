import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { INVOICE_PROVIDERS } from './invoice.providers';

@Module({
  imports: [DatabaseModule],
  providers: [...INVOICE_PROVIDERS],
  exports: [...INVOICE_PROVIDERS],
})
export class InvoicesModule {}
