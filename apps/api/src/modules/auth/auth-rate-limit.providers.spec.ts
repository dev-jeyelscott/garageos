import { describe, expect, it } from 'vitest';

import { AuthRateLimitService } from './application/auth-rate-limit.service';
import { AuthRateLimitStore } from './application/auth-rate-limit.store';
import { AUTH_RATE_LIMIT_EXPORTS, AUTH_RATE_LIMIT_PROVIDERS } from './auth-rate-limit.providers';
import { PostgresAuthRateLimitRepository } from './persistence/postgres-auth-rate-limit.repository';

describe('auth rate-limit provider boundary', () => {
  it('binds the stable rate-limit store token to the PostgreSQL repository', () => {
    expect(AUTH_RATE_LIMIT_PROVIDERS).toEqual(
      expect.arrayContaining([
        AuthRateLimitService,
        {
          provide: AuthRateLimitStore,
          useClass: PostgresAuthRateLimitRepository,
        },
      ]),
    );
  });

  it('exports only the application-facing rate-limit service', () => {
    expect(AUTH_RATE_LIMIT_EXPORTS).toEqual([AuthRateLimitService]);
  });
});
