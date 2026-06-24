import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

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
  controllers: [HealthController],
})
class AppModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);

  console.log(`GarageOS API running on http://localhost:${port}/api/v1`);
}

void bootstrap();
