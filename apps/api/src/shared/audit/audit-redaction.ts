export const REDACTED_AUDIT_VALUE = '[REDACTED]';

export const DEFAULT_AUDIT_SENSITIVE_FIELD_NAMES = [
  'password',
  'current_password',
  'new_password',
  'password_hash',
  'access_token',
  'refresh_token',
  'refresh_token_hash',
  'token',
  'token_hash',
  'authorization',
  'cookie',
  'secret',
  'client_secret',
  'api_key',
  'card_number',
  'cvv',
  'cvc',
] as const;

export interface AuditRedactionOptions {
  readonly sensitiveFieldNames?: readonly string[];
}

export function redactAuditPayload(payload: unknown, options: AuditRedactionOptions = {}): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (payload instanceof Date) {
    return payload.toISOString();
  }

  if (typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => redactAuditPayload(item, options));
  }

  const sensitiveFieldNames = options.sensitiveFieldNames ?? DEFAULT_AUDIT_SENSITIVE_FIELD_NAMES;

  const redactedPayload: Record<string, unknown> = {};

  for (const [fieldName, value] of Object.entries(payload as Record<string, unknown>)) {
    redactedPayload[fieldName] = isAuditSensitiveField(fieldName, sensitiveFieldNames)
      ? REDACTED_AUDIT_VALUE
      : redactAuditPayload(value, options);
  }

  return redactedPayload;
}

export function isAuditSensitiveField(
  fieldName: string,
  sensitiveFieldNames: readonly string[] = DEFAULT_AUDIT_SENSITIVE_FIELD_NAMES,
): boolean {
  const normalizedFieldName = normalizeAuditFieldName(fieldName);

  return sensitiveFieldNames
    .map((sensitiveFieldName) => normalizeAuditFieldName(sensitiveFieldName))
    .includes(normalizedFieldName);
}

function normalizeAuditFieldName(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s.]+/g, '_')
    .toLowerCase();
}
