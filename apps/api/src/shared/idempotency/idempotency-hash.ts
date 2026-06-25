import { createHash } from 'node:crypto';

export const IDEMPOTENCY_HASH_ALGORITHM = 'sha256';

export interface IdempotencyRequestIntent {
  readonly method: string;
  readonly route: string;
  readonly body?: unknown;
  readonly query?: unknown;
}

export function hashIdempotencyKey(idempotencyKey: string): string {
  return sha256(idempotencyKey);
}

export function hashRequestIntent(intent: IdempotencyRequestIntent): string {
  const normalizedIntent: {
    method: string;
    route: string;
    body?: unknown;
    query?: unknown;
  } = {
    method: intent.method.toUpperCase(),
    route: intent.route,
  };

  if (intent.body !== undefined) {
    normalizedIntent.body = intent.body;
  }

  if (intent.query !== undefined) {
    normalizedIntent.query = intent.query;
  }

  return sha256(stableStringify(normalizedIntent));
}

function sha256(value: string): string {
  return createHash(IDEMPOTENCY_HASH_ALGORITHM).update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}
