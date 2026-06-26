import { describe, expect, it } from 'vitest';

import { AuthSessionService } from './application/auth-session.service';
import { RefreshSessionStore } from './application/refresh-session.store';
import { AUTH_SESSION_EXPORTS, AUTH_SESSION_PROVIDERS } from './auth-session.providers';
import { PostgresRefreshSessionRepository } from './persistence/refresh-session.repository';

describe('auth session provider boundary', () => {
  it('binds the stable refresh-session store token to the PostgreSQL repository', () => {
    expect(AUTH_SESSION_PROVIDERS).toEqual(
      expect.arrayContaining([
        AuthSessionService,
        {
          provide: RefreshSessionStore,
          useClass: PostgresRefreshSessionRepository,
        },
      ]),
    );
  });

  it('exports only the application-facing auth session service', () => {
    expect(AUTH_SESSION_EXPORTS).toEqual([AuthSessionService]);
  });
});
