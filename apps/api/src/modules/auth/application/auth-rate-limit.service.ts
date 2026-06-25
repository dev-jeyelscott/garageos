import { Inject, Injectable } from '@nestjs/common';

import {
  assertAuthRateLimitAllowed,
  type AuthRateLimitRule,
  createAuthRateLimitCompositeKey,
} from './auth-rate-limit.policy';
import { AuthRateLimitStore } from './auth-rate-limit.store';

export interface AssertAuthRateLimitInput {
  readonly rule: AuthRateLimitRule;
  readonly keyParts: readonly string[];
  readonly tenantId?: string | null;
  readonly userId?: string | null;
  readonly ipAddress?: string | null;
}

@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(AuthRateLimitStore)
    private readonly store: AuthRateLimitStore,
  ) {}

  async assertAllowed(input: AssertAuthRateLimitInput): Promise<void> {
    const key = createAuthRateLimitCompositeKey(input.keyParts);
    const since = new Date(Date.now() - input.rule.windowSeconds * 1000);
    const attemptCountInWindow = await this.store.countEvents({
      bucket: input.rule.bucket,
      key,
      since,
    });

    assertAuthRateLimitAllowed({
      rule: input.rule,
      key,
      attemptCountInWindow,
    });
  }

  async recordAttempt(input: AssertAuthRateLimitInput): Promise<void> {
    await this.store.recordEvent({
      bucket: input.rule.bucket,
      key: createAuthRateLimitCompositeKey(input.keyParts),
      tenantId: input.tenantId,
      userId: input.userId,
      ipAddress: input.ipAddress,
    });
  }
}
