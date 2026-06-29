import { describe, expect, it } from 'vitest';

import { formatCounterMotionValue, getCounterMotionFrameValue } from './counter-motion-utils';

describe('counter motion helpers', () => {
  it('returns the starting value at zero progress', () => {
    expect(
      getCounterMotionFrameValue({
        from: 0,
        progress: 0,
        to: 100,
      }),
    ).toBe(0);
  });

  it('returns the target value at full progress', () => {
    expect(
      getCounterMotionFrameValue({
        from: 0,
        progress: 1,
        to: 100,
      }),
    ).toBe(100);
  });

  it('clamps progress outside the supported range', () => {
    expect(
      getCounterMotionFrameValue({
        from: 10,
        progress: -1,
        to: 20,
      }),
    ).toBe(10);

    expect(
      getCounterMotionFrameValue({
        from: 10,
        progress: 2,
        to: 20,
      }),
    ).toBe(20);
  });

  it('formats counter values with bounded decimal precision', () => {
    expect(formatCounterMotionValue(12, 0)).toBe('12');
    expect(formatCounterMotionValue(12.3456, 2)).toBe('12.35');
  });
});
