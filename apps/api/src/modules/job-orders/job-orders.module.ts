import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { JobOrdersController } from './api/job-orders.controller';
import { JobOrdersService } from './application/job-orders.service';
import { JOB_ORDER_PROVIDERS } from './job-order.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule, InventoryModule],
  controllers: [JobOrdersController],
  providers: [JobOrdersService, ...JOB_ORDER_PROVIDERS],
})
export class JobOrdersModule {}
