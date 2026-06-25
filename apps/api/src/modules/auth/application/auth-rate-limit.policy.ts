import { GarageOsApiException } from '../../../shared/api/api-exception';

export const AUTH_RATE_LIMIT_BUCKETS = {
  LOGIN: 'auth.login',
  PASSWORD_RESET: 'auth.password_reset',
  EMAIL_VERIFICATION_RESEND: 'auth.email_verification_resend',
} as const;

export type AuthRateLimitBucket =
  (typeof AUTH_RATE_LIMIT_BUCKETS)[keyof typeof AUTH_RATE_LIMIT_BUCKETS];

export interface AuthRateLimitRule {
  readonly bucket: AuthRateLimitBucket;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

export const AUTH_RATE_LIMIT_RULES = {
  LOGIN: {
    bucket: AUTH_RATE_LIMIT_BUCKETS.LOGIN,
    maxAttempts: 5,
    windowSeconds: 15 * 60,
  },
  PASSWORD_RESET: {
    bucket: AUTH_RATE_LIMIT_BUCKETS.PASSWORD_RESET,
    maxAttempts: 3,
    windowSeconds: 60 * 60,
  },
  EMAIL_VERIFICATION_RESEND: {
    bucket: AUTH_RATE_LIMIT_BUCKETS.EMAIL_VERIFICATION_RESEND,
    maxAttempts: 3,
    windowSeconds: 60 * 60,
  },
} as const satisfies Record<string, AuthRateLimitRule>;

export interface AuthRateLimitDecision {
  readonly allowed: boolean;
  readonly bucket: AuthRateLimitBucket;
  readonly key: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
  readonly reason: string;
}

export interface EvaluateAuthRateLimitInput {
  readonly rule: AuthRateLimitRule;
  readonly key: string;
  readonly attemptCountInWindow: number;
}

export function evaluateAuthRateLimit(input: EvaluateAuthRateLimitInput): AuthRateLimitDecision {
  const key = input.key.trim();

  if (!key) {
    throw new Error('Auth rate-limit key is required.');
  }

  const allowed = input.attemptCountInWindow < input.rule.maxAttempts;

  return {
    allowed,
    bucket: input.rule.bucket,
    key,
    attemptCount: input.attemptCountInWindow,
    maxAttempts: input.rule.maxAttempts,
    windowSeconds: input.rule.windowSeconds,
    reason: allowed ? 'auth_rate_limit_allows_request' : 'auth_rate_limit_exceeded',
  };
}

export function assertAuthRateLimitAllowed(input: EvaluateAuthRateLimitInput): void {
  const decision = evaluateAuthRateLimit(input);

  if (!decision.allowed) {
    throw GarageOsApiException.rateLimited();
  }
}

export function normalizeAuthRateLimitEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthRateLimitCompositeKey(parts: readonly string[]): string {
  const normalizedParts = parts.map((part) => part.trim().toLowerCase()).filter(Boolean);

  if (normalizedParts.length === 0) {
    throw new Error('Auth rate-limit composite key requires at least one non-empty part.');
  }

  return normalizedParts.join(':');
}
