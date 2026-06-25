export const API_AUDIT_SERVICE = Symbol('API_AUDIT_SERVICE');

export const AUDIT_ACTOR_TYPES = {
  TENANT_USER: 'tenant_user',
  PLATFORM_ADMIN: 'platform_admin',
  SYSTEM: 'system',
} as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[keyof typeof AUDIT_ACTOR_TYPES];

export const AUDIT_RETENTION_CLASSES = {
  STANDARD_3_YEAR: 'standard_3_year',
} as const;

export type AuditRetentionClass =
  (typeof AUDIT_RETENTION_CLASSES)[keyof typeof AUDIT_RETENTION_CLASSES];

export type AuditPayload = Readonly<Record<string, unknown>>;

export interface AuditActorContext {
  readonly actorType: AuditActorType;
  readonly actorUserId?: string;
  readonly supportAccessSessionId?: string;
}

export interface AuditEntityReference {
  readonly tenantId?: string;
  readonly branchId?: string;
  readonly entityType: string;
  readonly entityId?: string;
}

export interface AuditRequestContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface CreateAuditLogInput {
  readonly actor: AuditActorContext;
  readonly action: string;
  readonly entity: AuditEntityReference;
  readonly before?: AuditPayload;
  readonly after?: AuditPayload;
  readonly metadata?: AuditPayload;
  readonly reason?: string;
  readonly request?: AuditRequestContext;
  readonly retentionClass?: AuditRetentionClass;
  readonly createdAt?: Date;
}

export interface AuditLogRecord extends Omit<CreateAuditLogInput, 'createdAt' | 'retentionClass'> {
  readonly id: string;
  readonly retentionClass: AuditRetentionClass;
  readonly createdAt: Date;
}

export abstract class AuditService {
  abstract record(input: CreateAuditLogInput): Promise<AuditLogRecord>;
}
