import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './shared/audit/audit.module';
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
  imports: [AuthModule, AuditModule, IdempotencyModule],
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
