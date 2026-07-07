export type ReminderStatus = 'scheduled' | 'due' | 'sent' | 'failed' | 'cancelled';

export type ReminderDueReason = 'due_date' | 'due_mileage' | 'birthday';

export interface EvaluateReminderDueStatusInput {
  readonly status: ReminderStatus;
  readonly dueDate: string | null;
  readonly dueMileage: number | null;
  readonly latestMotorcycleMileage: number | null;
  readonly customerBirthday: string | null;
  readonly tenantTimezone: string;
  readonly now: Date;
}

export interface ReminderDueStatusResult {
  readonly status: ReminderStatus;
  readonly tenantCurrentDate: string;
  readonly dueReasons: readonly ReminderDueReason[];
}

interface DateOnlyParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const FINAL_REMINDER_STATUSES = new Set<ReminderStatus>(['sent', 'failed', 'cancelled']);

export function evaluateReminderDueStatus(
  input: EvaluateReminderDueStatusInput,
): ReminderDueStatusResult {
  assertValidCurrentTimestamp(input.now);

  const tenantCurrentDate = getDateOnlyInTimeZone(input.now, input.tenantTimezone);

  if (FINAL_REMINDER_STATUSES.has(input.status)) {
    return {
      status: input.status,
      tenantCurrentDate,
      dueReasons: [],
    };
  }

  const dueReasons = resolveDueReasons(input, tenantCurrentDate);

  return {
    status: dueReasons.length > 0 ? 'due' : 'scheduled',
    tenantCurrentDate,
    dueReasons,
  };
}

function resolveDueReasons(
  input: EvaluateReminderDueStatusInput,
  tenantCurrentDate: string,
): ReminderDueReason[] {
  const dueReasons: ReminderDueReason[] = [];

  if (input.dueDate !== null && compareDateOnly(tenantCurrentDate, input.dueDate) >= 0) {
    dueReasons.push('due_date');
  }

  if (
    input.dueMileage !== null &&
    input.latestMotorcycleMileage !== null &&
    input.latestMotorcycleMileage >= input.dueMileage
  ) {
    dueReasons.push('due_mileage');
  }

  if (
    input.customerBirthday !== null &&
    getMonthDay(tenantCurrentDate) === getMonthDay(input.customerBirthday)
  ) {
    dueReasons.push('birthday');
  }

  return dueReasons;
}

function compareDateOnly(left: string, right: string): number {
  return toEpochDay(left) - toEpochDay(right);
}

function toEpochDay(dateOnly: string): number {
  const parts = parseDateOnly(dateOnly);

  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function getMonthDay(dateOnly: string): string {
  const parts = parseDateOnly(dateOnly);

  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseDateOnly(value: string): DateOnlyParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1000 || year > 9999) {
    throw new Error('Date year must be a four-digit year from 1000 to 9999.');
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Date must be a valid calendar date.');
  }

  return {
    year,
    month,
    day,
  };
}

function getDateOnlyInTimeZone(date: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    throw new Error(`Invalid tenant timezone: ${timeZone}.`);
  }

  return `${getDatePart(parts, 'year')}-${getDatePart(parts, 'month')}-${getDatePart(
    parts,
    'day',
  )}`;
}

function getDatePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new Error(`Unable to resolve ${type} for tenant timezone date.`);
  }

  return part.value;
}

function assertValidCurrentTimestamp(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('A valid current timestamp is required.');
  }
}
