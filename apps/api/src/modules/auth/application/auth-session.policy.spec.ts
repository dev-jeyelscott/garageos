import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_POLICY } from './auth-session.policy';

describe('AUTH_SESSION_POLICY', () => {
  it('uses a 15 minute access token TTL', () => {
    expect(AUTH_SESSION_POLICY.accessTokenTtlSeconds).toBe(900);
  });

  it('caps remember-me refresh sessions at 30 days', () => {
    expect(AUTH_SESSION_POLICY.rememberMeRefreshSessionMaxAgeSeconds).toBe(2_592_000);
  });

  it('scopes refresh-token cookies to auth routes', () => {
    expect(AUTH_SESSION_POLICY.refreshTokenCookiePath).toBe('/api/v1/auth');
  });
});
