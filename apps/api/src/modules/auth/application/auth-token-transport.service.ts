import { Injectable } from '@nestjs/common';
import { AUTH_SESSION_POLICY } from './auth-session.policy';

export interface RefreshTokenCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge?: number;
}

export interface BuildRefreshTokenCookieOptionsInput {
  rememberMe: boolean;
  secureCookies?: boolean;
}

@Injectable()
export class AuthTokenTransportService {
  getRefreshTokenCookieName(): string {
    return AUTH_SESSION_POLICY.refreshTokenCookieName;
  }

  buildRefreshTokenCookieOptions(
    input: BuildRefreshTokenCookieOptionsInput,
  ): RefreshTokenCookieOptions {
    const baseOptions = {
      httpOnly: true,
      secure: input.secureCookies ?? true,
      sameSite: AUTH_SESSION_POLICY.refreshTokenCookieSameSite,
      path: AUTH_SESSION_POLICY.refreshTokenCookiePath,
    } satisfies RefreshTokenCookieOptions;

    if (!input.rememberMe) {
      return baseOptions;
    }

    return {
      ...baseOptions,
      maxAge: AUTH_SESSION_POLICY.rememberMeRefreshSessionMaxAgeSeconds * 1000,
    };
  }

  buildClearRefreshTokenCookieOptions(): RefreshTokenCookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: AUTH_SESSION_POLICY.refreshTokenCookieSameSite,
      path: AUTH_SESSION_POLICY.refreshTokenCookiePath,
    };
  }
}
