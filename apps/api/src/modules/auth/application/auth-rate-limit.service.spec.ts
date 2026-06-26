import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUTH_RATE_LIMIT_RULES } from './auth-rate-limit.policy';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  AuthRateLimitStore,
  type CountAuthRateLimitEventsInput,
  type RecordAuthRateLimitEventInput,
} from './auth-rate-limit.store';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('AuthRateLimitService', () => {
  it('checks the store using the normalized composite key and allows below-limit requests', async () => {
    const store = new FakeAuthRateLimitStore();
    store.countResult = 4;

    const service = new AuthRateLimitService(store);

    await service.assertAllowed({
      rule: AUTH_RATE_LIMIT_RULES.LOGIN,
      keyParts: [' Owner@Example.Com ', ' 127.0.0.1 '],
    });

    expect(store.countInputs).toHaveLength(1);
    expect(store.countInputs[0]).toMatchObject({
      bucket: AUTH_RATE_LIMIT_RULES.LOGIN.bucket,
      key: 'owner@example.com:127.0.0.1',
    });
    expect(store.countInputs[0]?.since).toBeInstanceOf(Date);
  });

  it('throws the stable rate-limited error when the store count has reached the limit', async () => {
    const store = new FakeAuthRateLimitStore();
    store.countResult = 5;

    const service = new AuthRateLimitService(store);

    try {
      await service.assertAllowed({
        rule: AUTH_RATE_LIMIT_RULES.LOGIN,
        keyParts: ['owner@example.com', '127.0.0.1'],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GarageOsApiException);
      expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.RATE_LIMITED);
      return;
    }

    throw new Error('Expected rate_limited error.');
  });

  it('records attempts through the store using the normalized composite key', async () => {
    const store = new FakeAuthRateLimitStore();
    const service = new AuthRateLimitService(store);

    await service.recordAttempt({
      rule: AUTH_RATE_LIMIT_RULES.PASSWORD_RESET,
      keyParts: [' Owner@Example.Com '],
      tenantId: TENANT_ID,
      userId: USER_ID,
      ipAddress: '127.0.0.1',
    });

    expect(store.recordInputs).toEqual([
      {
        bucket: AUTH_RATE_LIMIT_RULES.PASSWORD_RESET.bucket,
        key: 'owner@example.com',
        tenantId: TENANT_ID,
        userId: USER_ID,
        ipAddress: '127.0.0.1',
      },
    ]);
  });
});

class FakeAuthRateLimitStore extends AuthRateLimitStore {
  countResult = 0;
  readonly countInputs: CountAuthRateLimitEventsInput[] = [];
  readonly recordInputs: RecordAuthRateLimitEventInput[] = [];

  async countEvents(input: CountAuthRateLimitEventsInput): Promise<number> {
    this.countInputs.push(input);
    return this.countResult;
  }

  async recordEvent(input: RecordAuthRateLimitEventInput): Promise<void> {
    this.recordInputs.push(input);
  }
}
