import { describe, expect, it } from 'vitest';

import {
  API_IDEMPOTENCY_STORE,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  IDEMPOTENCY_RESERVATION_OUTCOMES,
  IDEMPOTENCY_STATUSES,
} from './idempotency';

describe('idempotency contract', () => {
  it('uses the documented API idempotency header names', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
    expect(IDEMPOTENCY_REPLAYED_HEADER).toBe('Idempotency-Replayed');
  });

  it('uses schema-aligned idempotency statuses', () => {
    expect(Object.values(IDEMPOTENCY_STATUSES)).toEqual([
      'processing',
      'succeeded',
      'failed',
      'expired',
    ]);
  });

  it('exposes reservation outcomes for future middleware/service orchestration', () => {
    expect(Object.values(IDEMPOTENCY_RESERVATION_OUTCOMES)).toEqual([
      'reserved',
      'replay',
      'processing',
      'conflict',
      'expired',
    ]);
  });

  it('exposes a stable dependency-injection token for the future store implementation', () => {
    expect(API_IDEMPOTENCY_STORE.description).toBe('API_IDEMPOTENCY_STORE');
  });
});
