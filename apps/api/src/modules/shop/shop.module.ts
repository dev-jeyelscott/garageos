import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { ShopController } from './api/shop.controller';
import { ShopService } from './application/shop.service';
import { SHOP_PROVIDERS } from './shop.providers';

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule, IdempotencyModule],
  controllers: [ShopController],
  providers: [ShopService, ...SHOP_PROVIDERS],
  exports: [ShopService],
})
export class ShopModule {}
