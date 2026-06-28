import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './api/products.controller';
import { ProductsService } from './application/products.service';
import { PRODUCT_PROVIDERS } from './product.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ProductsController],
  providers: [ProductsService, ...PRODUCT_PROVIDERS],
})
export class ProductsModule {}
