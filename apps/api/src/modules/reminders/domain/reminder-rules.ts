export type ReminderStatus = 'scheduled' | 'due' | 'sent' | 'failed' | 'cancelled';

export type ReminderDueReason = 'due_date' | 'due_mileage' | 'birthday';

export type ReminderChannel =
  'internal_in_app' | 'internal_push' | 'internal_email' | 'customer_email' | 'customer_sms';

export type NotificationChannel = 'in_app' | 'push' | 'email' | 'sms';

export type PlanChannelCapability =
  | 'in_app_notifications'
  | 'push_notifications'
  | 'email_notifications'
  | 'sms_notifications'
  | 'customer_email_reminders'
  | 'customer_sms_reminders';

export interface PlanChannelLimits {
  readonly in_app_notifications?: boolean | number | string | null;
  readonly push_notifications?: boolean | number | string | null;
  readonly email_notifications?: boolean | number | string | null;
  readonly sms_notifications?: boolean | number | string | null;
  readonly customer_email_reminders?: boolean | number | string | null;
  readonly customer_sms_reminders?: boolean | number | string | null;
  readonly [capabilityCode: string]: boolean | number | string | null | undefined;
}

export interface PlanChannelBlock {
  readonly channel: ReminderChannel | NotificationChannel;
  readonly capability: PlanChannelCapability;
}

export class PlanChannelLimitError extends Error {
  readonly blockedChannels: readonly PlanChannelBlock[];

  constructor(blockedChannels: readonly PlanChannelBlock[]) {
    super(buildPlanChannelLimitMessage(blockedChannels));
    this.name = 'PlanChannelLimitError';
    this.blockedChannels = blockedChannels;
  }
}

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

export function assertReminderChannelsAllowedByPlan(
  channels: readonly ReminderChannel[],
  limits: PlanChannelLimits,
): void {
  const blockedChannels = getBlockedReminderChannels(channels, limits);

  if (blockedChannels.length > 0) {
    throw new PlanChannelLimitError(blockedChannels);
  }
}

export function assertNotificationChannelsAllowedByPlan(
  channels: readonly NotificationChannel[],
  limits: PlanChannelLimits,
): void {
  const blockedChannels = getBlockedNotificationChannels(channels, limits);

  if (blockedChannels.length > 0) {
    throw new PlanChannelLimitError(blockedChannels);
  }
}

export function getBlockedReminderChannels(
  channels: readonly ReminderChannel[],
  limits: PlanChannelLimits,
): PlanChannelBlock[] {
  return getBlockedPlanChannels(channels, limits, getReminderChannelCapability);
}

export function getBlockedNotificationChannels(
  channels: readonly NotificationChannel[],
  limits: PlanChannelLimits,
): PlanChannelBlock[] {
  return getBlockedPlanChannels(channels, limits, getNotificationChannelCapability);
}

export function getReminderChannelCapability(channel: ReminderChannel): PlanChannelCapability {
  switch (channel) {
    case 'internal_in_app':
      return 'in_app_notifications';
    case 'internal_push':
      return 'push_notifications';
    case 'internal_email':
      return 'email_notifications';
    case 'customer_email':
      return 'customer_email_reminders';
    case 'customer_sms':
      return 'customer_sms_reminders';
  }
}

export function getNotificationChannelCapability(
  channel: NotificationChannel,
): PlanChannelCapability {
  switch (channel) {
    case 'in_app':
      return 'in_app_notifications';
    case 'push':
      return 'push_notifications';
    case 'email':
      return 'email_notifications';
    case 'sms':
      return 'sms_notifications';
  }
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

function getBlockedPlanChannels<TChannel extends ReminderChannel | NotificationChannel>(
  channels: readonly TChannel[],
  limits: PlanChannelLimits,
  resolveCapability: (channel: TChannel) => PlanChannelCapability,
): PlanChannelBlock[] {
  const blockedChannels: PlanChannelBlock[] = [];

  for (const channel of channels) {
    const capability = resolveCapability(channel);

    if (!isPlanCapabilityEnabled(limits[capability])) {
      blockedChannels.push({
        channel,
        capability,
      });
    }
  }

  return blockedChannels;
}

function isPlanCapabilityEnabled(value: boolean | number | string | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

function buildPlanChannelLimitMessage(blockedChannels: readonly PlanChannelBlock[]): string {
  const channelList = blockedChannels.map((blocked) => blocked.channel).join(', ');

  return `Current tenant plan does not allow selected channel(s): ${channelList}.`;
}
