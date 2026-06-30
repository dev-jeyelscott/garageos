import type { MiddlewareConsumer } from '@nestjs/common';
import { Controller, Get, Module, RequestMethod, type NestModule } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { BranchModule } from './modules/branches/branch.module';
import { CustomersModule } from './modules/customers/customers.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { JobOrdersModule } from './modules/job-orders/job-orders.module';
import { MechanicSessionsModule } from './modules/mechanic-sessions/mechanic-sessions.module';
import { ProductsModule } from './modules/products/products.module';
import { MotorcyclesModule } from './modules/motorcycles/motorcycles.module';
import { ProductCategoriesModule } from './modules/product-categories/product-categories.module';
import { ServicesModule } from './modules/services/services.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RolesModule } from './modules/roles/role.module';
import { ShopModule } from './modules/shop/shop.module';
import { AuditModule } from './shared/audit/audit.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InventoryAdjustmentsModule } from './modules/inventory-adjustments/inventory-adjustments.module';
import { InventoryTransfersModule } from './modules/inventory-transfers/inventory-transfers.module';
import { BackgroundJobsModule } from './shared/background-jobs/background-jobs.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';
import { RequestContextMiddleware } from './shared/observability/request-context.middleware';

@Controller()
export class HealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    RolesModule,
    ShopModule,
    BranchModule,
    EmployeesModule,
    EstimatesModule,
    JobOrdersModule,
    ProductsModule,
    InventoryModule,
    InventoryAdjustmentsModule,
    InventoryTransfersModule,
    MechanicSessionsModule,
    CustomersModule,
    MotorcyclesModule,
    ServicesModule,
    ProductCategoriesModule,
    AuditModule,
    IdempotencyModule,
    BackgroundJobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
