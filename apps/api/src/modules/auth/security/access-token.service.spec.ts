import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { AuthAccessTokenSignPayload } from './access-token.service';
import { AccessTokenService, type AccessTokenSigningOptions } from './access-token.service';
import { AUTH_SESSION_POLICY } from '../application/auth-session.policy';

const signingOptions: AccessTokenSigningOptions = {
  issuer: 'garageos-api',
  audience: 'garageos-pwa',
  secret: 'test-access-token-secret-at-least-32-chars',
};

const payload = {
  user_id: '11111111-1111-4111-8111-111111111111',
  session_id: '22222222-2222-4222-8222-222222222222',
  tenant_id: '33333333-3333-4333-8333-333333333333',
  user_type: 'tenant_user',
  email_verified: true,
} satisfies AuthAccessTokenSignPayload;

describe('AccessTokenService', () => {
  it('signs an access token using the configured access-token TTL', async () => {
    const service = new AccessTokenService(signingOptions);

    const result = await service.sign(payload);

    expect(result.access_token).toBeTruthy();
    expect(result.expires_in_seconds).toBe(AUTH_SESSION_POLICY.accessTokenTtlSeconds);
  });

  it('verifies a signed access token and returns the access-token payload', async () => {
    const service = new AccessTokenService(signingOptions);

    const signed = await service.sign(payload);
    const verified = await service.verify(signed.access_token);

    expect(verified).toEqual(
      expect.objectContaining({
        ...payload,
        token_type: 'access',
        sub: payload.user_id,
        user_id: payload.user_id,
        session_id: payload.session_id,
        tenant_id: payload.tenant_id,
        user_type: payload.user_type,
        email_verified: payload.email_verified,
        iat: expect.any(Number),
        exp: expect.any(Number),
        jti: expect.any(String),
      }),
    );

    expect(verified.exp).toBeGreaterThan(verified.iat);
  });

  it('rejects an empty access token', async () => {
    const service = new AccessTokenService(signingOptions);

    await expect(service.verify('')).rejects.toBeInstanceOf(GarageOsApiException);
  });

  it('rejects an expired access token', async () => {
    const service = new AccessTokenService(signingOptions);
    const secretKey = new TextEncoder().encode(signingOptions.secret);

    const expiredToken = await new SignJWT({
      ...payload,
      token_use: 'access',
    })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
      })
      .setIssuer(signingOptions.issuer)
      .setAudience(signingOptions.audience)
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(secretKey);

    await expect(service.verify(expiredToken)).rejects.toBeInstanceOf(GarageOsApiException);
  });

  it('rejects a token signed with a different secret', async () => {
    const service = new AccessTokenService(signingOptions);

    const otherService = new AccessTokenService({
      ...signingOptions,
      secret: 'different-access-token-secret-32-chars',
    });

    const signed = await otherService.sign(payload);

    await expect(service.verify(signed.access_token)).rejects.toBeInstanceOf(GarageOsApiException);
  });

  it('does not sign tokens when the signing secret is missing or unsafe', async () => {
    const service = new AccessTokenService({
      ...signingOptions,
      secret: 'too-short',
    });

    await expect(service.sign(payload)).rejects.toBeInstanceOf(GarageOsApiException);
  });
});
