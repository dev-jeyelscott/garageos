import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { API_DATABASE_CLIENT } from './database-client';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  it('exports the shared API database client provider token', () => {
    const exportsMetadata = Reflect.getMetadata('exports', DatabaseModule) as unknown[] | undefined;

    expect(exportsMetadata).toContain(API_DATABASE_CLIENT);
  });
});
