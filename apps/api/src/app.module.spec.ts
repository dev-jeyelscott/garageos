import 'reflect-metadata';

import { RequestMethod, type MiddlewareConsumer } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { AppModule, HealthController } from './app.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RequestContextMiddleware } from './shared/observability/request-context.middleware';

describe('AppModule', () => {
  it('wires the health controller through the real application module', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) as
      | unknown[]
      | undefined;

    expect(controllers).toContain(HealthController);
  });

  it('wires the platform module through the real application module', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as
      | unknown[]
      | undefined;

    expect(imports).toContain(PlatformModule);
  });

  it('applies request context middleware to all routes', () => {
    const forRoutes = vi.fn();
    const apply = vi.fn(() => ({
      forRoutes,
    }));
    const consumer = {
      apply,
    } as unknown as MiddlewareConsumer;

    new AppModule().configure(consumer);

    expect(apply).toHaveBeenCalledWith(RequestContextMiddleware);
    expect(forRoutes).toHaveBeenCalledWith({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  });
});
