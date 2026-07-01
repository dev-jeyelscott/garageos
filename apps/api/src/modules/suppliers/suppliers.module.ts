import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { SuppliersController } from './api/suppliers.controller';
import { SupplierService } from './application/supplier.service';
import { SUPPLIER_PROVIDERS } from './supplier.providers';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule, IdempotencyModule],
  controllers: [SuppliersController],
  providers: [SupplierService, ...SUPPLIER_PROVIDERS],
  exports: [SupplierService, ...SUPPLIER_PROVIDERS],
})
export class SuppliersModule {}
