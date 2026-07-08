export const REDACTED_PROVIDER_LOG_VALUE = '[REDACTED]';

const SECRET_FIELD_PATTERN =
  /password|token|secret|credential|authorization|cookie|signature|api[_-]?key|card|cvv|cvc/i;

export const DEFAULT_PROVIDER_LOG_REDACTED_FIELD_NAMES = [
  'to',
  'from',
  'cc',
  'bcc',
  'email',
  'emails',
  'phone',
  'phone_number',
  'mobile_number',
  'recipient',
  'recipients',
  'sender',
  'subject',
  'body',
  'text',
  'html',
  'message',
  'content',
  'signed_url',
  'file_url',
  'download_url',
] as const;

export type ProviderPayloadLogLevel = 'debug' | 'log' | 'warn' | 'error';

export interface ProviderPayloadLogger {
  debug(message: string): void;
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ProviderPayloadLogInput {
  readonly logger: ProviderPayloadLogger;
  readonly level: ProviderPayloadLogLevel;
  readonly event: string;
  readonly provider: string;
  readonly channel: string;
  readonly direction: 'inbound' | 'outbound';
  readonly payload: unknown;
  readonly requestId?: string | null;
  readonly correlationId?: string | null;
  readonly tenantId?: string | null;
  readonly actorUserId?: string | null;
  readonly jobId?: string | null;
  readonly deliveryAttemptId?: string | null;
  readonly errorCode?: string | null;
}

export interface ProviderPayloadLogEntry {
  readonly event: string;
  readonly provider: string;
  readonly channel: string;
  readonly direction: 'inbound' | 'outbound';
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly tenant_id?: string;
  readonly actor_user_id?: string;
  readonly job_id?: string;
  readonly delivery_attempt_id?: string;
  readonly error_code?: string;
  readonly payload: unknown;
}

type MutableProviderPayloadLogEntry = {
  -readonly [Key in keyof ProviderPayloadLogEntry]: ProviderPayloadLogEntry[Key];
};

export interface ProviderPayloadRedactionOptions {
  readonly redactedFieldNames?: readonly string[];
}

export function logSanitizedProviderPayload(
  input: ProviderPayloadLogInput,
): ProviderPayloadLogEntry {
  const entry = createProviderPayloadLogEntry(input);

  input.logger[input.level](JSON.stringify(entry));

  return entry;
}

export function createProviderPayloadLogEntry(
  input: Omit<ProviderPayloadLogInput, 'logger' | 'level'>,
): ProviderPayloadLogEntry {
  const entry: MutableProviderPayloadLogEntry = {
    event: normalizeRequiredProviderLogText(input.event, 'Provider log event is required.'),
    provider: normalizeRequiredProviderLogText(input.provider, 'Provider name is required.'),
    channel: normalizeRequiredProviderLogText(input.channel, 'Provider channel is required.'),
    direction: input.direction,
    payload: sanitizeProviderLogPayload(input.payload),
  };

  addOptionalProviderLogField(entry, 'request_id', input.requestId);
  addOptionalProviderLogField(entry, 'correlation_id', input.correlationId);
  addOptionalProviderLogField(entry, 'tenant_id', input.tenantId);
  addOptionalProviderLogField(entry, 'actor_user_id', input.actorUserId);
  addOptionalProviderLogField(entry, 'job_id', input.jobId);
  addOptionalProviderLogField(entry, 'delivery_attempt_id', input.deliveryAttemptId);
  addOptionalProviderLogField(entry, 'error_code', input.errorCode);

  return entry;
}

export function sanitizeProviderLogPayload(
  payload: unknown,
  options: ProviderPayloadRedactionOptions = {},
): unknown {
  if (payload === undefined || payload === null) {
    return null;
  }

  if (payload instanceof Date) {
    return payload.toISOString();
  }

  if (typeof payload === 'number') {
    return Number.isFinite(payload) ? payload : null;
  }

  if (typeof payload === 'bigint') {
    return payload.toString();
  }

  if (typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeProviderLogPayload(item, options));
  }

  const redactedFieldNames =
    options.redactedFieldNames ?? DEFAULT_PROVIDER_LOG_REDACTED_FIELD_NAMES;

  const sanitizedPayload: Record<string, unknown> = {};

  for (const [fieldName, value] of Object.entries(payload as Record<string, unknown>)) {
    sanitizedPayload[fieldName] = isProviderLogRedactedField(fieldName, redactedFieldNames)
      ? REDACTED_PROVIDER_LOG_VALUE
      : sanitizeProviderLogPayload(value, options);
  }

  return sanitizedPayload;
}

export function isProviderLogRedactedField(
  fieldName: string,
  redactedFieldNames: readonly string[] = DEFAULT_PROVIDER_LOG_REDACTED_FIELD_NAMES,
): boolean {
  const normalizedFieldName = normalizeProviderLogFieldName(fieldName);

  if (SECRET_FIELD_PATTERN.test(normalizedFieldName)) {
    return true;
  }

  return redactedFieldNames
    .map((redactedFieldName) => normalizeProviderLogFieldName(redactedFieldName))
    .includes(normalizedFieldName);
}

function normalizeRequiredProviderLogText(value: string, errorMessage: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new Error(errorMessage);
  }

  return normalizedValue;
}

function normalizeNullableProviderLogText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeProviderLogFieldName(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s.]+/g, '_')
    .toLowerCase();
}

function addOptionalProviderLogField(
  entry: MutableProviderPayloadLogEntry,
  fieldName: keyof Omit<
    ProviderPayloadLogEntry,
    'event' | 'provider' | 'channel' | 'direction' | 'payload'
  >,
  value: string | null | undefined,
): void {
  const normalizedValue = normalizeNullableProviderLogText(value);

  if (normalizedValue !== undefined) {
    entry[fieldName] = normalizedValue;
  }
}
