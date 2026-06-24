import { describe, expect, it } from 'vitest';
import { GARAGEOS_APP_NAME } from './index';

describe('shared package', () => {
  it('exports the application name', () => {
    expect(GARAGEOS_APP_NAME).toBe('GarageOS');
  });
});
