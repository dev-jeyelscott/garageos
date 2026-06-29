import { describe, expect, it } from 'vitest';

import { TENANT_STATUSES } from '../../../shared/tenant-context/tenant-context';
import { calculateSubscriptionLifecycleStatus } from './subscription-lifecycle-calculator';

describe('calculateSubscriptionLifecycleStatus', () => {
  it.each([
    {
      tenantCurrentDate: '2026-06-29',
      expectedDaysAfterExpiration: -1,
      expectedStatus: TENANT_STATUSES.ACTIVE,
    },
    {
      tenantCurrentDate: '2026-06-30',
      expectedDaysAfterExpiration: 0,
      expectedStatus: TENANT_STATUSES.ACTIVE,
    },
    {
      tenantCurrentDate: '2026-07-01',
      expectedDaysAfterExpiration: 1,
      expectedStatus: TENANT_STATUSES.GRACE_PERIOD,
    },
    {
      tenantCurrentDate: '2026-07-14',
      expectedDaysAfterExpiration: 14,
      expectedStatus: TENANT_STATUSES.GRACE_PERIOD,
    },
    {
      tenantCurrentDate: '2026-07-15',
      expectedDaysAfterExpiration: 15,
      expectedStatus: TENANT_STATUSES.READ_ONLY,
    },
    {
      tenantCurrentDate: '2026-07-30',
      expectedDaysAfterExpiration: 30,
      expectedStatus: TENANT_STATUSES.READ_ONLY,
    },
    {
      tenantCurrentDate: '2026-07-31',
      expectedDaysAfterExpiration: 31,
      expectedStatus: TENANT_STATUSES.SUSPENDED,
    },
    {
      tenantCurrentDate: '2026-08-29',
      expectedDaysAfterExpiration: 60,
      expectedStatus: TENANT_STATUSES.SUSPENDED,
    },
    {
      tenantCurrentDate: '2026-08-30',
      expectedDaysAfterExpiration: 61,
      expectedStatus: TENANT_STATUSES.PENDING_DELETION,
    },
    {
      tenantCurrentDate: '2026-09-05',
      expectedDaysAfterExpiration: 67,
      expectedStatus: TENANT_STATUSES.PENDING_DELETION,
    },
    {
      tenantCurrentDate: '2026-09-06',
      expectedDaysAfterExpiration: 68,
      expectedStatus: TENANT_STATUSES.DELETED,
    },
  ])(
    'returns $expectedStatus on tenant local date $tenantCurrentDate',
    ({ tenantCurrentDate, expectedDaysAfterExpiration, expectedStatus }) => {
      const result = calculateSubscriptionLifecycleStatus({
        expirationDate: '2026-06-30',
        tenantTimezone: 'Asia/Manila',
        now: toManilaNoonUtc(tenantCurrentDate),
      });

      expect(result).toEqual({
        status: expectedStatus,
        tenantCurrentDate,
        daysAfterExpiration: expectedDaysAfterExpiration,
      });
    },
  );

  it('treats expiration day as active until the next local midnight in the tenant timezone', () => {
    const result = calculateSubscriptionLifecycleStatus({
      expirationDate: '2026-06-30',
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-06-30T15:59:59.999Z'),
    });

    expect(result).toEqual({
      status: TENANT_STATUSES.ACTIVE,
      tenantCurrentDate: '2026-06-30',
      daysAfterExpiration: 0,
    });
  });

  it('starts Day 1 at local midnight after expiration in the tenant timezone', () => {
    const result = calculateSubscriptionLifecycleStatus({
      expirationDate: '2026-06-30',
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-06-30T16:00:00.000Z'),
    });

    expect(result).toEqual({
      status: TENANT_STATUSES.GRACE_PERIOD,
      tenantCurrentDate: '2026-07-01',
      daysAfterExpiration: 1,
    });
  });

  it('uses the configured tenant timezone instead of UTC day boundaries', () => {
    const resultBeforeNewYorkLocalMidnight = calculateSubscriptionLifecycleStatus({
      expirationDate: '2026-06-30',
      tenantTimezone: 'America/New_York',
      now: new Date('2026-07-01T03:59:59.999Z'),
    });

    expect(resultBeforeNewYorkLocalMidnight).toEqual({
      status: TENANT_STATUSES.ACTIVE,
      tenantCurrentDate: '2026-06-30',
      daysAfterExpiration: 0,
    });

    const resultAtNewYorkLocalMidnight = calculateSubscriptionLifecycleStatus({
      expirationDate: '2026-06-30',
      tenantTimezone: 'America/New_York',
      now: new Date('2026-07-01T04:00:00.000Z'),
    });

    expect(resultAtNewYorkLocalMidnight).toEqual({
      status: TENANT_STATUSES.GRACE_PERIOD,
      tenantCurrentDate: '2026-07-01',
      daysAfterExpiration: 1,
    });
  });

  it('rejects invalid expiration dates', () => {
    expect(() =>
      calculateSubscriptionLifecycleStatus({
        expirationDate: '2026-02-30',
        tenantTimezone: 'Asia/Manila',
        now: new Date('2026-06-30T16:00:00.000Z'),
      }),
    ).toThrow('Date must be a valid calendar date.');
  });

  it('rejects invalid tenant timezones', () => {
    expect(() =>
      calculateSubscriptionLifecycleStatus({
        expirationDate: '2026-06-30',
        tenantTimezone: 'Invalid/Timezone',
        now: new Date('2026-06-30T16:00:00.000Z'),
      }),
    ).toThrow('Invalid tenant timezone: Invalid/Timezone.');
  });
});

function toManilaNoonUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T04:00:00.000Z`);
}
