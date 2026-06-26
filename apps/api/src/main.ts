import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ErrorEnvelopeFilter } from './shared/api/error-envelope.filter';
import { ResponseEnvelopeInterceptor } from './shared/api/response-envelope.interceptor';

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
