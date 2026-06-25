import type { AuthRateLimitBucket } from './auth-rate-limit.policy';

export interface CountAuthRateLimitEventsInput {
  readonly bucket: AuthRateLimitBucket;
  readonly key: string;
  readonly since: Date;
}

export interface RecordAuthRateLimitEventInput {
  readonly bucket: AuthRateLimitBucket;
  readonly key: string;
  readonly tenantId?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly metadata?: Record<string, unknown>;
}

export abstract class AuthRateLimitStore {
  abstract countEvents(input: CountAuthRateLimitEventsInput): Promise<number>;

  abstract recordEvent(input: RecordAuthRateLimitEventInput): Promise<void>;
}
