import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { AuthAccessTokenPayload } from '../contracts';
import { AUTH_SESSION_POLICY } from '../application/auth-session.policy';

export const ACCESS_TOKEN_SIGNING_OPTIONS = Symbol('ACCESS_TOKEN_SIGNING_OPTIONS');

const ACCESS_TOKEN_TYPE = 'access' as const;
const MIN_ACCESS_TOKEN_SECRET_LENGTH = 32;

type ManagedAccessTokenClaimName = 'token_type' | 'sub' | 'iat' | 'exp' | 'jti';

export type AuthAccessTokenSignPayload = Omit<AuthAccessTokenPayload, ManagedAccessTokenClaimName>;

export interface AccessTokenSigningOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly secret: string;
}

export interface SignedAccessToken {
  readonly access_token: string;
  readonly expires_in_seconds: number;
}

type JwtAccessTokenPayload = AuthAccessTokenPayload & {
  readonly token_use: typeof ACCESS_TOKEN_TYPE;
};

@Injectable()
export class AccessTokenService {
  private readonly textEncoder = new TextEncoder();

  constructor(
    @Inject(ACCESS_TOKEN_SIGNING_OPTIONS)
    private readonly options: AccessTokenSigningOptions,
  ) {}

  async sign(payload: AuthAccessTokenSignPayload): Promise<SignedAccessToken> {
    const secretKey = this.getSecretKey();

    const accessToken = await new SignJWT({
      ...payload,
      token_type: ACCESS_TOKEN_TYPE,
    })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setSubject(payload.user_id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(AUTH_SESSION_POLICY.accessTokenTtlSeconds)
      .sign(secretKey);

    return {
      access_token: accessToken,
      expires_in_seconds: AUTH_SESSION_POLICY.accessTokenTtlSeconds,
    };
  }

  async verify(accessToken: string): Promise<AuthAccessTokenPayload> {
    if (accessToken.trim().length === 0) {
      throw GarageOsApiException.unauthenticated('Access token is required.');
    }

    try {
      const verified = await jwtVerify(accessToken, this.getSecretKey(), {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['HS256'],
      });

      if (!isAuthAccessTokenPayload(verified.payload)) {
        throw GarageOsApiException.unauthenticated('Access token is invalid or expired.');
      }

      return verified.payload;
    } catch (error) {
      if (error instanceof GarageOsApiException) {
        throw error;
      }

      throw GarageOsApiException.unauthenticated('Access token is invalid or expired.');
    }
  }

  private getSecretKey(): Uint8Array {
    const secret = this.options.secret.trim();

    if (secret.length < MIN_ACCESS_TOKEN_SECRET_LENGTH) {
      throw GarageOsApiException.serviceUnavailable('Access token signing is not configured.');
    }

    return this.textEncoder.encode(secret);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthAccessTokenPayload(payload: unknown): payload is AuthAccessTokenPayload {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    payload.token_type === ACCESS_TOKEN_TYPE &&
    typeof payload.sub === 'string' &&
    typeof payload.user_id === 'string' &&
    typeof payload.user_type === 'string' &&
    (typeof payload.tenant_id === 'string' || payload.tenant_id === null) &&
    typeof payload.session_id === 'string' &&
    typeof payload.email_verified === 'boolean' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    typeof payload.jti === 'string' &&
    payload.sub === payload.user_id
  );
}
