import { afterEach, beforeEach, vi } from 'vitest';

// Keep this exact value synchronized with the named invoice service test.
// Exact-match scoping prevents the fake clock from affecting unrelated tests.
const PARTIAL_REFUND_STATUS_TEST =
  'records a partial refund and recalculates a paid invoice back to partially paid';
const PARTIAL_REFUND_TEST_NOW = new Date('2026-07-08T00:00:00.000Z');

beforeEach(({ task }) => {
  if (task.name !== PARTIAL_REFUND_STATUS_TEST) {
    return;
  }

  vi.useFakeTimers();
  vi.setSystemTime(PARTIAL_REFUND_TEST_NOW);
});

afterEach(({ task }) => {
  if (task.name !== PARTIAL_REFUND_STATUS_TEST) {
    return;
  }

  vi.useRealTimers();
});
