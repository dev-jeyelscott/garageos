import { describe, expect, it } from 'vitest';
import { PasswordHashingService } from './password-hashing.service';
import { SecureTokenService } from './secure-token.service';
import { TokenHashingService } from './token-hashing.service';
import { AUTH_SECURITY } from './auth-security.constants';

describe('auth security services', () => {
  it('hashes and verifies password with Argon2id', async () => {
    const service = new PasswordHashingService();

    const password = 'Secret123';
    const hash = await service.hashPassword(password);

    expect(hash).not.toBe([password]);
    expect(hash).toContain('argon2id');

    await expect(service.verifyPassword(password, hash)).resolves.toBe(true);
    await expect(service.verifyPassword('WrongSecret123', hash)).resolves.toBe(false);
  });

  it('generates opaque random tokens', () => {
    const service = new SecureTokenService();

    const tokenA = service.generateOpaqueToken();
    const tokenB = service.generateOpaqueToken();

    expect(tokenA).not.toEqual(tokenB);
    expect(tokenA.length).toBeGreaterThan(12);
    expect(tokenB.length).toBeGreaterThan(12);
  });

  it('hashes and verifies tokens without storing plaintext tokens', () => {
    const service = new TokenHashingService();

    const token = 'reset-token-example';
    const hash = service.hashToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(service.verifyToken(token, hash)).toBe(true);
    expect(service.verifyToken('wrong-token', hash)).toBe(false);
  });

  it('centralizes documented auth security constraints', () => {
    expect(AUTH_SECURITY.ACCESS_TOKEN_EXPIRES_IN_SECONDS).toBe(900);
    expect(AUTH_SECURITY.REMEMBER_ME_REFRESH_SESSION_EXPIRES_IN_DAYS).toBe(30);
    expect(AUTH_SECURITY.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES).toBe(30);
    expect(AUTH_SECURITY.EMPLOYEE_INVITATION_TOKEN_EXPIRES_IN_DAYS).toBe(7);
  });
});
