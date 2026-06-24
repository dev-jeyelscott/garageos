import { describe, expect, it } from 'vitest';

import { createTestUuid } from './index';

describe('@garageos/test-utils', () => {
  it('creates a deterministic test UUID', () => {
    expect(createTestUuid()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
