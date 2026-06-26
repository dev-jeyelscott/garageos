import { describe, expect, it } from 'vitest';

import { AuthUserStore } from './application/auth-user.store';
import { AUTH_USER_PROVIDERS } from './auth-user.providers';
import { PostgresAuthUserRepository } from './persistence/postgres-auth-user.repository';

describe('auth user provider boundary', () => {
  it('binds the stable auth-user store token to the PostgreSQL repository', () => {
    expect(AUTH_USER_PROVIDERS).toEqual([
      {
        provide: AuthUserStore,
        useClass: PostgresAuthUserRepository,
      },
    ]);
  });
});
