import { describe, expect, it } from 'vitest';

import { resolveRequiredDatabaseUrl } from './postgres-database-client';

const missingDatabaseUrlMessage = 'DATABASE_URL is required to start the GarageOS API.';

describe('resolveRequiredDatabaseUrl', () => {
  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => resolveRequiredDatabaseUrl({})).toThrow(missingDatabaseUrlMessage);
  });

  it('fails fast when DATABASE_URL is empty', () => {
    expect(() => resolveRequiredDatabaseUrl({ DATABASE_URL: '' })).toThrow(
      missingDatabaseUrlMessage,
    );
  });

  it('fails fast when DATABASE_URL is whitespace only', () => {
    expect(() => resolveRequiredDatabaseUrl({ DATABASE_URL: '   ' })).toThrow(
      missingDatabaseUrlMessage,
    );
  });

  it('returns a trimmed DATABASE_URL when configured', () => {
    expect(
      resolveRequiredDatabaseUrl({
        DATABASE_URL: '  postgresql://garageos:garageos@localhost:5432/garageos_test  ',
      }),
    ).toBe('postgresql://garageos:garageos@localhost:5432/garageos_test');
  });
});
