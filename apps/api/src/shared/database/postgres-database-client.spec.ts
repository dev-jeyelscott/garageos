import { describe, expect, it } from 'vitest';

import { resolveRequiredDatabaseUrl } from './postgres-database-client';

describe('resolveRequiredDatabaseUrl', () => {
  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => resolveRequiredDatabaseUrl({})).toThrow(
      'DATABASE_URL is required. Set it to a PostgreSQL connection URL before starting the API.',
    );
  });

  it('fails fast when DATABASE_URL is blank', () => {
    expect(() => resolveRequiredDatabaseUrl({ DATABASE_URL: '   ' })).toThrow(
      'DATABASE_URL is required. Set it to a PostgreSQL connection URL before starting the API.',
    );
  });

  it('fails fast when DATABASE_URL is not a valid URL', () => {
    expect(() => resolveRequiredDatabaseUrl({ DATABASE_URL: 'not-a-url' })).toThrow(
      'DATABASE_URL must be a valid PostgreSQL connection URL.',
    );
  });

  it('fails fast when DATABASE_URL does not use a PostgreSQL protocol', () => {
    expect(() =>
      resolveRequiredDatabaseUrl({ DATABASE_URL: 'mysql://localhost/garageos' }),
    ).toThrow('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
  });

  it('returns a trimmed PostgreSQL connection URL', () => {
    expect(
      resolveRequiredDatabaseUrl({
        DATABASE_URL: '  postgresql://garageos:garageos@localhost:5432/garageos_test  ',
      }),
    ).toBe('postgresql://garageos:garageos@localhost:5432/garageos_test');
  });
});
