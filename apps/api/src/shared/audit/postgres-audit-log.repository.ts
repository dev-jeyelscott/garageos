import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../database/database-client';
import {
  AUDIT_ACTOR_TYPES,
  type AuditActorType,
  type AuditLogRecord,
  AuditLogStore,
  type CreateAuditLogInput,
} from './audit-log.store';

interface AuditLogRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly actor_user_id: string | null;
  readonly actor_type: string;
  readonly support_access_session_id: string | null;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly branch_id: string | null;
  readonly before_json: unknown | null;
  readonly after_json: unknown | null;
  readonly metadata_json: unknown | null;
  readonly reason: string | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly retention_class: string;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresAuditLogRepository extends AuditLogStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async create(
    input: CreateAuditLogInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<AuditLogRecord> {
    const result = await client.query<AuditLogRow>(
      `
        insert into audit_logs (
          id,
          tenant_id,
          actor_user_id,
          actor_type,
          support_access_session_id,
          action,
          entity_type,
          entity_id,
          branch_id,
          before_json,
          after_json,
          metadata_json,
          reason,
          ip_address,
          user_agent,
          retention_class,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5::uuid,
          $6,
          $7,
          $8::uuid,
          $9::uuid,
          $10::jsonb,
          $11::jsonb,
          $12::jsonb,
          $13,
          $14::inet,
          $15,
          $16,
          $17::timestamptz
        )
        returning
          id,
          tenant_id,
          actor_user_id,
          actor_type,
          support_access_session_id,
          action,
          entity_type,
          entity_id,
          branch_id,
          before_json,
          after_json,
          metadata_json,
          reason,
          ip_address::text,
          user_agent,
          retention_class,
          created_at
      `,
      [
        input.id,
        input.tenantId,
        input.actorUserId,
        input.actorType,
        input.supportAccessSessionId,
        input.action,
        input.entityType,
        input.entityId,
        input.branchId,
        toNullableJsonString(input.beforeJson),
        toNullableJsonString(input.afterJson),
        toNullableJsonString(input.metadataJson),
        input.reason,
        input.ipAddress,
        input.userAgent,
        input.retentionClass,
        input.createdAt,
      ],
    );

    return mapAuditLogRow(getRequiredRow(result, 'create audit log'));
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Audit repository failed to ${operation}.`);
  }

  return row;
}

function mapAuditLogRow(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorType: mapAuditActorType(row.actor_type),
    supportAccessSessionId: row.support_access_session_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    branchId: row.branch_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    metadataJson: row.metadata_json,
    reason: row.reason,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    retentionClass: row.retention_class,
    createdAt: toDate(row.created_at),
  };
}

function mapAuditActorType(actorType: string): AuditActorType {
  if (
    actorType === AUDIT_ACTOR_TYPES.TENANT_USER ||
    actorType === AUDIT_ACTOR_TYPES.PLATFORM_ADMIN ||
    actorType === AUDIT_ACTOR_TYPES.SYSTEM
  ) {
    return actorType;
  }

  throw new Error(`Unknown audit actor type: ${actorType}.`);
}

function toNullableJsonString(value: unknown | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
