import { describe, expect, it } from 'vitest';

import { API_DATABASE_CLIENT } from '../../../shared/database/database-client';
import { AUTH_DATABASE_CLIENT, AUTH_DATABASE_CLIENT_PROVIDER } from './database-client';

describe('AUTH_DATABASE_CLIENT_PROVIDER', () => {
  it('bridges the auth database token to the shared API database client token', () => {
    expect(AUTH_DATABASE_CLIENT_PROVIDER).toEqual({
      provide: AUTH_DATABASE_CLIENT,
      useExisting: API_DATABASE_CLIENT,
    });
  });
});
