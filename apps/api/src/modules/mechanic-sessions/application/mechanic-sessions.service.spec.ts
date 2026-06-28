import { describe, expect, it } from 'vitest';

import {
  assertCanFinishMechanicWorkSession,
  assertCanPauseMechanicWorkSession,
  assertCanResumeMechanicWorkSession,
  assertCanStartMechanicWorkSessionForJobOrder,
  calculateMechanicSessionActiveSeconds,
} from './mechanic-sessions.service';

describe('mechanic work session validators', () => {
  it.each(['in_progress', 'waiting_for_parts'] as const)(
    'allows starting a mechanic work session when job order is %s',
    (status) => {
      expect(() =>
        assertCanStartMechanicWorkSessionForJobOrder({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['pending', 'completed', 'released', 'cancelled'] as const)(
    'blocks starting a mechanic work session when job order is %s',
    (status) => {
      expect(() =>
        assertCanStartMechanicWorkSessionForJobOrder({
          status,
        }),
      ).toThrow('Mechanic work sessions can only start on active job orders.');
    },
  );

  it('allows pausing an active session without an open pause', () => {
    expect(() =>
      assertCanPauseMechanicWorkSession({
        status: 'active',
        pauses: [],
      }),
    ).not.toThrow();
  });

  it('blocks pausing a non-active session', () => {
    expect(() =>
      assertCanPauseMechanicWorkSession({
        status: 'paused',
        pauses: [],
      }),
    ).toThrow('Only active mechanic work sessions can be paused.');
  });

  it('blocks pausing when an open pause already exists', () => {
    expect(() =>
      assertCanPauseMechanicWorkSession({
        status: 'active',
        pauses: [
          {
            pausedAt: new Date('2026-06-28T01:00:00.000Z'),
            resumedAt: null,
          },
        ],
      }),
    ).toThrow('Mechanic work session already has an open pause.');
  });

  it('allows resuming a paused session with an open pause', () => {
    expect(() =>
      assertCanResumeMechanicWorkSession({
        status: 'paused',
        pauses: [
          {
            pausedAt: new Date('2026-06-28T01:00:00.000Z'),
            resumedAt: null,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('blocks resuming a non-paused session', () => {
    expect(() =>
      assertCanResumeMechanicWorkSession({
        status: 'active',
        pauses: [],
      }),
    ).toThrow('Only paused mechanic work sessions can be resumed.');
  });

  it('blocks resuming when no open pause exists', () => {
    expect(() =>
      assertCanResumeMechanicWorkSession({
        status: 'paused',
        pauses: [
          {
            pausedAt: new Date('2026-06-28T01:00:00.000Z'),
            resumedAt: new Date('2026-06-28T01:15:00.000Z'),
          },
        ],
      }),
    ).toThrow('Paused mechanic work session does not have an open pause.');
  });

  it.each(['active', 'paused'] as const)(
    'allows finishing a %s mechanic work session',
    (status) => {
      expect(() =>
        assertCanFinishMechanicWorkSession({
          status,
        }),
      ).not.toThrow();
    },
  );

  it('blocks finishing an already finished mechanic work session', () => {
    expect(() =>
      assertCanFinishMechanicWorkSession({
        status: 'finished',
      }),
    ).toThrow('Only active or paused mechanic work sessions can be finished.');
  });
});

describe('mechanic active duration calculation', () => {
  it('calculates active duration without pauses', () => {
    expect(
      calculateMechanicSessionActiveSeconds({
        startedAt: new Date('2026-06-28T01:00:00.000Z'),
        finishedAt: new Date('2026-06-28T02:00:00.000Z'),
        pauses: [],
      }),
    ).toBe(3600);
  });

  it('excludes completed pauses from active duration', () => {
    expect(
      calculateMechanicSessionActiveSeconds({
        startedAt: new Date('2026-06-28T01:00:00.000Z'),
        finishedAt: new Date('2026-06-28T02:00:00.000Z'),
        pauses: [
          {
            pausedAt: new Date('2026-06-28T01:15:00.000Z'),
            resumedAt: new Date('2026-06-28T01:30:00.000Z'),
          },
        ],
      }),
    ).toBe(2700);
  });

  it('excludes an open pause through finish time', () => {
    expect(
      calculateMechanicSessionActiveSeconds({
        startedAt: new Date('2026-06-28T01:00:00.000Z'),
        finishedAt: new Date('2026-06-28T02:00:00.000Z'),
        pauses: [
          {
            pausedAt: new Date('2026-06-28T01:45:00.000Z'),
            resumedAt: null,
          },
        ],
      }),
    ).toBe(2700);
  });

  it('never returns negative active seconds', () => {
    expect(
      calculateMechanicSessionActiveSeconds({
        startedAt: new Date('2026-06-28T02:00:00.000Z'),
        finishedAt: new Date('2026-06-28T01:00:00.000Z'),
        pauses: [],
      }),
    ).toBe(0);
  });
});
