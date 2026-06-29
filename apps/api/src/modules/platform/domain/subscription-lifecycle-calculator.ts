import { TENANT_STATUSES } from '../../../shared/tenant-context/tenant-context';

const MILLISECONDS_PER_DAY = 86_400_000;

export type SubscriptionLifecycleComputedStatus =
  | typeof TENANT_STATUSES.ACTIVE
  | typeof TENANT_STATUSES.GRACE_PERIOD
  | typeof TENANT_STATUSES.READ_ONLY
  | typeof TENANT_STATUSES.SUSPENDED
  | typeof TENANT_STATUSES.PENDING_DELETION
  | typeof TENANT_STATUSES.DELETED;

export interface CalculateSubscriptionLifecycleStatusInput {
  readonly expirationDate: string;
  readonly tenantTimezone: string;
  readonly now: Date;
}

export interface SubscriptionLifecycleStatusResult {
  readonly status: SubscriptionLifecycleComputedStatus;
  readonly tenantCurrentDate: string;
  readonly daysAfterExpiration: number;
}

interface DateOnlyParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function calculateSubscriptionLifecycleStatus(
  input: CalculateSubscriptionLifecycleStatusInput,
): SubscriptionLifecycleStatusResult {
  assertValidCurrentTimestamp(input.now);

  const tenantCurrentDate = getDateOnlyInTimeZone(input.now, input.tenantTimezone);
  const daysAfterExpiration = differenceInDateOnlyDays(tenantCurrentDate, input.expirationDate);

  return {
    status: resolveLifecycleStatus(daysAfterExpiration),
    tenantCurrentDate,
    daysAfterExpiration,
  };
}

function resolveLifecycleStatus(daysAfterExpiration: number): SubscriptionLifecycleComputedStatus {
  if (daysAfterExpiration <= 0) {
    return TENANT_STATUSES.ACTIVE;
  }

  if (daysAfterExpiration <= 14) {
    return TENANT_STATUSES.GRACE_PERIOD;
  }

  if (daysAfterExpiration <= 30) {
    return TENANT_STATUSES.READ_ONLY;
  }

  if (daysAfterExpiration <= 60) {
    return TENANT_STATUSES.SUSPENDED;
  }

  if (daysAfterExpiration <= 67) {
    return TENANT_STATUSES.PENDING_DELETION;
  }

  return TENANT_STATUSES.DELETED;
}

function differenceInDateOnlyDays(laterDateOnly: string, earlierDateOnly: string): number {
  return toEpochDay(laterDateOnly) - toEpochDay(earlierDateOnly);
}

function toEpochDay(dateOnly: string): number {
  const parts = parseDateOnly(dateOnly);

  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / MILLISECONDS_PER_DAY);
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
