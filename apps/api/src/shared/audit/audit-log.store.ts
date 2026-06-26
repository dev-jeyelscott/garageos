import type { DatabaseQueryClient } from '../database/database-client';

export const AUDIT_ACTOR_TYPES = {
  TENANT_USER: 'tenant_user',
  PLATFORM_ADMIN: 'platform_admin',
  SYSTEM: 'system',
} as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[keyof typeof AUDIT_ACTOR_TYPES];

export interface AuditLogRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly actorUserId: string | null;
  readonly actorType: AuditActorType;
  readonly supportAccessSessionId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly branchId: string | null;
  readonly beforeJson: unknown | null;
  readonly afterJson: unknown | null;
  readonly metadataJson: unknown | null;
  readonly reason: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly retentionClass: string;
  readonly createdAt: Date;
}

export interface CreateAuditLogInput {
  readonly id: string;
  readonly tenantId: string | null;
  readonly actorUserId: string | null;
  readonly actorType: AuditActorType;
  readonly supportAccessSessionId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly branchId: string | null;
  readonly beforeJson: unknown | null;
  readonly afterJson: unknown | null;
  readonly metadataJson: unknown | null;
  readonly reason: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly retentionClass: string;
  readonly createdAt: Date;
}

export abstract class AuditLogStore {
  abstract create(
    input: CreateAuditLogInput,
    client?: DatabaseQueryClient,
  ): Promise<AuditLogRecord>;
}
