import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertAuthRateLimitAllowed,
  AUTH_RATE_LIMIT_BUCKETS,
  AUTH_RATE_LIMIT_RULES,
  createAuthRateLimitCompositeKey,
  evaluateAuthRateLimit,
  normalizeAuthRateLimitEmailKey,
} from './auth-rate-limit.policy';

describe('auth rate-limit policy', () => {
  it('defines documented auth rate-limit rules', () => {
    expect(AUTH_RATE_LIMIT_RULES.LOGIN).toEqual({
      bucket: AUTH_RATE_LIMIT_BUCKETS.LOGIN,
      maxAttempts: 5,
      windowSeconds: 15 * 60,
    });

    expect(AUTH_RATE_LIMIT_RULES.PASSWORD_RESET).toEqual({
      bucket: AUTH_RATE_LIMIT_BUCKETS.PASSWORD_RESET,
      maxAttempts: 3,
      windowSeconds: 60 * 60,
    });

    expect(AUTH_RATE_LIMIT_RULES.EMAIL_VERIFICATION_RESEND).toEqual({
      bucket: AUTH_RATE_LIMIT_BUCKETS.EMAIL_VERIFICATION_RESEND,
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    });
  });

  it('allows attempts while the current window count is below the max', () => {
    const decision = evaluateAuthRateLimit({
      rule: AUTH_RATE_LIMIT_RULES.LOGIN,
      key: 'owner@example.com:127.0.0.1',
      attemptCountInWindow: 4,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('auth_rate_limit_allows_request');
  });

  it('blocks attempts when the current window count has reached the max', () => {
    const decision = evaluateAuthRateLimit({
      rule: AUTH_RATE_LIMIT_RULES.LOGIN,
      key: 'owner@example.com:127.0.0.1',
      attemptCountInWindow: 5,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('auth_rate_limit_exceeded');
  });

  it('throws a stable rate-limited API exception when blocked', () => {
    try {
      assertAuthRateLimitAllowed({
        rule: AUTH_RATE_LIMIT_RULES.PASSWORD_RESET,
        key: 'owner@example.com',
        attemptCountInWindow: 3,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GarageOsApiException);
      expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.RATE_LIMITED);
      return;
    }

    throw new Error('Expected rate_limited error.');
  });

  it('normalizes email keys consistently', () => {
    expect(normalizeAuthRateLimitEmailKey(' Owner@Example.Com ')).toBe('owner@example.com');
  });

  it('creates normalized composite keys from non-empty parts', () => {
    expect(createAuthRateLimitCompositeKey([' Owner@Example.Com ', ' 127.0.0.1 '])).toBe(
      'owner@example.com:127.0.0.1',
    );
  });

  it('rejects empty composite keys', () => {
    expect(() => createAuthRateLimitCompositeKey([' ', ''])).toThrow(
      'Auth rate-limit composite key requires at least one non-empty part.',
    );
  });
});
