import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_POLICY } from './auth-session.policy';
import { AuthTokenTransportService } from './auth-token-transport.service';

describe('AuthTokenTransportService', () => {
  const service = new AuthTokenTransportService();

  it('returns the documented refresh token cookie name', () => {
    expect(service.getRefreshTokenCookieName()).toBe(AUTH_SESSION_POLICY.refreshTokenCookieName);
  });

  it('builds secure httpOnly SameSite=Lax refresh cookie options', () => {
    expect(service.buildRefreshTokenCookieOptions({ rememberMe: false })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  });

  it('does not persist the browser cookie when remember-me is false', () => {
    const options = service.buildRefreshTokenCookieOptions({
      rememberMe: false,
    });

    expect(Object.hasOwn(options, 'maxAge')).toBe(false);
  });

  it('sets maxAge when remember-me is true', () => {
    const options = service.buildRefreshTokenCookieOptions({
      rememberMe: true,
    });

    expect(options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('allows secure cookie behavior to be overridden for controlled local tests', () => {
    const options = service.buildRefreshTokenCookieOptions({
      rememberMe: false,
      secureCookies: false,
    });

    expect(options.secure).toBe(false);
  });

  it('builds clear-cookie options matching the refresh cookie path', () => {
    expect(service.buildClearRefreshTokenCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  });
});
