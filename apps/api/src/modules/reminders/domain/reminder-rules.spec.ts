import { describe, expect, it } from 'vitest';

import {
  PlanChannelLimitError,
  assertNotificationChannelsAllowedByPlan,
  assertReminderChannelsAllowedByPlan,
  evaluateReminderDueStatus,
  getBlockedNotificationChannels,
  getBlockedReminderChannels,
} from './reminder-rules';

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

describe('plan channel enforcement', () => {
  const basicPlanLimits = {
    in_app_notifications: true,
    push_notifications: true,
    email_notifications: false,
    sms_notifications: false,
    customer_email_reminders: false,
    customer_sms_reminders: false,
  };

  const midPlanLimits = {
    in_app_notifications: true,
    push_notifications: true,
    email_notifications: true,
    sms_notifications: false,
    customer_email_reminders: true,
    customer_sms_reminders: false,
  };

  const highPlanLimits = {
    in_app_notifications: true,
    push_notifications: true,
    email_notifications: true,
    sms_notifications: true,
    customer_email_reminders: true,
    customer_sms_reminders: true,
  };

  it('blocks customer email, customer SMS, and internal email reminders on Basic', () => {
    expect(
      getBlockedReminderChannels(
        ['internal_in_app', 'internal_push', 'internal_email', 'customer_email', 'customer_sms'],
        basicPlanLimits,
      ),
    ).toEqual([
      {
        channel: 'internal_email',
        capability: 'email_notifications',
      },
      {
        channel: 'customer_email',
        capability: 'customer_email_reminders',
      },
      {
        channel: 'customer_sms',
        capability: 'customer_sms_reminders',
      },
    ]);
  });

  it('allows customer email but blocks customer SMS reminders on Mid', () => {
    expect(
      getBlockedReminderChannels(
        ['internal_email', 'customer_email', 'customer_sms'],
        midPlanLimits,
      ),
    ).toEqual([
      {
        channel: 'customer_sms',
        capability: 'customer_sms_reminders',
      },
    ]);
  });

  it('allows all documented reminder channels on High', () => {
    expect(
      getBlockedReminderChannels(
        ['internal_in_app', 'internal_push', 'internal_email', 'customer_email', 'customer_sms'],
        highPlanLimits,
      ),
    ).toEqual([]);
  });

  it('throws a plan channel limit error without switching selected reminder channels', () => {
    expect(() =>
      assertReminderChannelsAllowedByPlan(['customer_email', 'customer_sms'], basicPlanLimits),
    ).toThrow(PlanChannelLimitError);

    try {
      assertReminderChannelsAllowedByPlan(['customer_email', 'customer_sms'], basicPlanLimits);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanChannelLimitError);
      expect((error as PlanChannelLimitError).blockedChannels).toEqual([
        {
          channel: 'customer_email',
          capability: 'customer_email_reminders',
        },
        {
          channel: 'customer_sms',
          capability: 'customer_sms_reminders',
        },
      ]);
    }
  });

  it('blocks notification preference channels using notification plan capabilities', () => {
    expect(
      getBlockedNotificationChannels(['in_app', 'push', 'email', 'sms'], basicPlanLimits),
    ).toEqual([
      {
        channel: 'email',
        capability: 'email_notifications',
      },
      {
        channel: 'sms',
        capability: 'sms_notifications',
      },
    ]);
  });

  it('throws a plan channel limit error for blocked notification channels', () => {
    expect(() =>
      assertNotificationChannelsAllowedByPlan(['email', 'sms'], basicPlanLimits),
    ).toThrow(PlanChannelLimitError);
  });
});
