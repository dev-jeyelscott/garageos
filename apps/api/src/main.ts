import 'reflect-metadata';
import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ErrorEnvelopeFilter } from './shared/api/error-envelope.filter';
import { ResponseEnvelopeInterceptor } from './shared/api/response-envelope.interceptor';
import { RequestContextMiddleware } from './shared/observability/request-context.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';

@Controller()
class HealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}

@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [HealthController],
})
class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);

  console.log(`GarageOS API running on http://localhost:${port}/api/v1`);
}

void bootstrap();
