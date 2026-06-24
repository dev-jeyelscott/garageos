import { describe, expect, it } from 'vitest';

import { TYPESCRIPT_STRICT_MODE_REQUIRED } from './index';

describe('@garageos/config', () => {
  it('exports shared config markers', () => {
    expect(TYPESCRIPT_STRICT_MODE_REQUIRED).toBe(true);
  });
});
