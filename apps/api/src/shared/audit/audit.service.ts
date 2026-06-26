import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { DatabaseQueryClient } from '../database/database-client';
import {
  AUDIT_ACTOR_TYPES,
  type AuditActorType,
  type AuditLogRecord,
  AuditLogStore,
} from './audit-log.store';

export { AUDIT_ACTOR_TYPES, type AuditActorType };

export const AUDIT_RETENTION_CLASSES = {
  STANDARD_3_YEAR: 'standard_3_year',
} as const;

export interface RecordAuditLogInput {
  readonly tenantId?: string | null;
  readonly actorUserId?: string | null;
  readonly actorType: AuditActorType;
  readonly supportAccessSessionId?: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly branchId?: string | null;
  readonly beforeJson?: unknown;
  readonly afterJson?: unknown;
  readonly metadataJson?: unknown;
  readonly reason?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly retentionClass?: string;
  readonly createdAt?: Date;
  readonly client?: DatabaseQueryClient;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(AuditLogStore)
    private readonly auditLogStore: AuditLogStore,
  ) {}

  async record(input: RecordAuditLogInput): Promise<AuditLogRecord> {
    const now = input.createdAt ?? new Date();

    return this.auditLogStore.create(
      {
        id: randomUUID(),
        tenantId: normalizeNullableText(input.tenantId),
        actorUserId: normalizeNullableText(input.actorUserId),
        actorType: input.actorType,
        supportAccessSessionId: normalizeNullableText(input.supportAccessSessionId),
        action: normalizeRequiredText(input.action, 'Audit action is required.'),
        entityType: normalizeRequiredText(input.entityType, 'Audit entity type is required.'),
        entityId: normalizeNullableText(input.entityId),
        branchId: normalizeNullableText(input.branchId),
        beforeJson: sanitizeAuditJson(input.beforeJson),
        afterJson: sanitizeAuditJson(input.afterJson),
        metadataJson: sanitizeAuditJson(input.metadataJson),
        reason: normalizeNullableText(input.reason),
        ipAddress: normalizeIpAddress(input.ipAddress),
        userAgent: normalizeNullableText(input.userAgent),
        retentionClass:
          normalizeNullableText(input.retentionClass) ?? AUDIT_RETENTION_CLASSES.STANDARD_3_YEAR,
        createdAt: now,
      },
      input.client,
    );
  }
}

function normalizeRequiredText(value: string, errorMessage: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new Error(errorMessage);
  }

  return normalizedValue;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeIpAddress(value: string | null | undefined): string | null {
  const normalizedValue = normalizeNullableText(value);

  if (normalizedValue === null) {
    return null;
  }

  const firstForwardedAddress = normalizedValue.split(',')[0]?.trim();

  return firstForwardedAddress && firstForwardedAddress.length > 0 ? firstForwardedAddress : null;
}

function sanitizeAuditJson(value: unknown): unknown | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditJson(item));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = isSensitiveAuditKey(key) ? '[redacted]' : sanitizeAuditJson(entryValue);
    }

    return sanitized;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function isSensitiveAuditKey(key: string): boolean {
  return /password|token|secret|authorization|cookie|credential/i.test(key);
}
