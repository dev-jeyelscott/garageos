export const AUTH_SESSION_POLICY = {
  accessTokenTtlSeconds: 15 * 60,
  rememberMeRefreshSessionMaxAgeSeconds: 30 * 24 * 60 * 60,
  refreshTokenCookieName: 'garageos_refresh_token',
  refreshTokenCookiePath: '/api/v1/auth',
  refreshTokenCookieSameSite: 'lax',
} as const;

export type AuthRefreshTokenCookieSameSite = typeof AUTH_SESSION_POLICY.refreshTokenCookieSameSite;
