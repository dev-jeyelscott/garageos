import { describe, expect, it } from 'vitest';

import { evaluateReminderDueStatus } from './reminder-rules';

describe('evaluateReminderDueStatus', () => {
  it('marks a time-based reminder due using the tenant timezone date', () => {
    const result = evaluateReminderDueStatus({
      status: 'scheduled',
      dueDate: '2026-07-08',
      dueMileage: null,
      latestMotorcycleMileage: null,
      customerBirthday: null,
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T16:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'due',
      tenantCurrentDate: '2026-07-08',
      dueReasons: ['due_date'],
    });
  });

  it('keeps a time-based reminder scheduled before the tenant local due date', () => {
    const result = evaluateReminderDueStatus({
      status: 'scheduled',
      dueDate: '2026-07-08',
      dueMileage: null,
      latestMotorcycleMileage: null,
      customerBirthday: null,
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T15:59:59.999Z'),
    });

    expect(result).toEqual({
      status: 'scheduled',
      tenantCurrentDate: '2026-07-07',
      dueReasons: [],
    });
  });

  it('marks a mileage reminder due when latest motorcycle mileage reaches the target', () => {
    const result = evaluateReminderDueStatus({
      status: 'scheduled',
      dueDate: null,
      dueMileage: 15_000,
      latestMotorcycleMileage: 15_000,
      customerBirthday: null,
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T08:00:00.000Z'),
    });

    expect(result.status).toBe('due');
    expect(result.dueReasons).toEqual(['due_mileage']);
  });

  it('does not mark a mileage reminder due without a latest motorcycle mileage', () => {
    const result = evaluateReminderDueStatus({
      status: 'scheduled',
      dueDate: null,
      dueMileage: 15_000,
      latestMotorcycleMileage: null,
      customerBirthday: null,
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T08:00:00.000Z'),
    });

    expect(result.status).toBe('scheduled');
    expect(result.dueReasons).toEqual([]);
  });

  it('marks a birthday reminder due by month and day in the tenant timezone', () => {
    const result = evaluateReminderDueStatus({
      status: 'scheduled',
      dueDate: null,
      dueMileage: null,
      latestMotorcycleMileage: null,
      customerBirthday: '1990-07-08',
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T16:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'due',
      tenantCurrentDate: '2026-07-08',
      dueReasons: ['birthday'],
    });
  });

  it('preserves final reminder statuses during evaluation', () => {
    const result = evaluateReminderDueStatus({
      status: 'sent',
      dueDate: '2026-07-01',
      dueMileage: 10_000,
      latestMotorcycleMileage: 20_000,
      customerBirthday: '1990-07-08',
      tenantTimezone: 'Asia/Manila',
      now: new Date('2026-07-07T16:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'sent',
      tenantCurrentDate: '2026-07-08',
      dueReasons: [],
    });
  });
});
