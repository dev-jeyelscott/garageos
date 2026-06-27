import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';
import { ProductCategoriesController } from './api/product-categories.controller';
import { ProductCategoriesService } from './application/product-categories.service';
import { PRODUCT_CATEGORY_PROVIDERS } from './product-category.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ProductCategoriesController],
  providers: [ProductCategoriesService, ...PRODUCT_CATEGORY_PROVIDERS],
})
export class ProductCategoriesModule {}
