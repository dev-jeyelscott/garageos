import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierReturnsController } from './api/supplier-returns.controller';
import { SupplierReturnService } from './application/supplier-return.service';
import { SUPPLIER_RETURN_PROVIDERS } from './supplier-return.providers';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule, IdempotencyModule, InventoryModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnService, ...SUPPLIER_RETURN_PROVIDERS],
  exports: [SupplierReturnService, ...SUPPLIER_RETURN_PROVIDERS],
})
export class SupplierReturnsModule {}
