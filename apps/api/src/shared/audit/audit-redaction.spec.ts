import { describe, expect, it } from 'vitest';

import { REDACTED_AUDIT_VALUE, isAuditSensitiveField, redactAuditPayload } from './audit-redaction';

describe('audit redaction', () => {
  it('detects sensitive field names using snake_case, kebab-case, dotted, and camelCase forms', () => {
    expect(isAuditSensitiveField('password')).toBe(true);
    expect(isAuditSensitiveField('password_hash')).toBe(true);
    expect(isAuditSensitiveField('refreshTokenHash')).toBe(true);
    expect(isAuditSensitiveField('access-token')).toBe(true);
    expect(isAuditSensitiveField('client.secret')).toBe(true);
    expect(isAuditSensitiveField('display_name')).toBe(false);
  });

  it('redacts sensitive values recursively without removing safe audit context', () => {
    const payload = {
      email: 'owner@example.test',
      password: 'plaintext-password',
      profile: {
        full_name: 'Juan Dela Cruz',
        refreshTokenHash: 'hashed-refresh-token',
      },
      attempts: [
        {
          ip_address: '127.0.0.1',
          access_token: 'bearer-token',
        },
      ],
    };

    expect(redactAuditPayload(payload)).toEqual({
      email: 'owner@example.test',
      password: REDACTED_AUDIT_VALUE,
      profile: {
        full_name: 'Juan Dela Cruz',
        refreshTokenHash: REDACTED_AUDIT_VALUE,
      },
      attempts: [
        {
          ip_address: '127.0.0.1',
          access_token: REDACTED_AUDIT_VALUE,
        },
      ],
    });
  });

  it('supports command-specific sensitive field names', () => {
    const payload = {
      safe_value: 'visible',
      garageSecret: 'hidden',
    };

    expect(
      redactAuditPayload(payload, {
        sensitiveFieldNames: ['garage_secret'],
      }),
    ).toEqual({
      safe_value: 'visible',
      garageSecret: REDACTED_AUDIT_VALUE,
    });
  });

  it('does not mutate the original payload', () => {
    const payload = {
      password: 'plaintext-password',
      nested: {
        token: 'token-value',
      },
    };

    redactAuditPayload(payload);

    expect(payload).toEqual({
      password: 'plaintext-password',
      nested: {
        token: 'token-value',
      },
    });
  });

  it('serializes dates to JSON-safe audit values', () => {
    expect(redactAuditPayload(new Date('2026-06-24T00:00:00.000Z'))).toBe(
      '2026-06-24T00:00:00.000Z',
    );
  });
});
