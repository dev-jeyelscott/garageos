import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Controller()
class HealthController {
  @Get('/health')
  health() {
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);

  console.log(`GarageOS API running on http://localhost:${port}`);
}

void bootstrap();
