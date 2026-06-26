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

export interface BuildClearRefreshTokenCookieOptionsInput {
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

  buildClearRefreshTokenCookieOptions(
    input: BuildClearRefreshTokenCookieOptionsInput = {},
  ): RefreshTokenCookieOptions {
    return {
      httpOnly: true,
      secure: input.secureCookies ?? true,
      sameSite: AUTH_SESSION_POLICY.refreshTokenCookieSameSite,
      path: AUTH_SESSION_POLICY.refreshTokenCookiePath,
    };
  }

  getRefreshTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
    if (cookieHeader === null || cookieHeader === undefined || cookieHeader.trim().length === 0) {
      return null;
    }

    const cookieName = this.getRefreshTokenCookieName();
    const cookies = cookieHeader.split(';');

    for (const cookie of cookies) {
      const separatorIndex = cookie.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      if (name === cookieName && value.length > 0) {
        return value;
      }
    }

    return null;
  }
}
