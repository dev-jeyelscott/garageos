import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type CreateSupportAccessSessionInput,
  type PlatformTenantOperationTenantRecord,
  PlatformTenantOperationsStore,
  type SupportAccessSessionRecord,
} from '../application/platform-tenant-operations.store';

interface TenantOperationRow extends DatabaseRow {
  readonly id: string;
  readonly status: string;
  readonly deletion_scheduled_for: Date | string | null;
}

interface SupportAccessRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly platform_admin_user_id: string;
  readonly access_mode: 'read_only' | 'write_allowed';
  readonly reason: string;
  readonly started_at: Date | string;
  readonly expires_at: Date | string;
  readonly ended_at: Date | string | null;
}

@Injectable()
export class PostgresPlatformTenantOperationsRepository extends PlatformTenantOperationsStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async findTenantForOperation(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<PlatformTenantOperationTenantRecord | null> {
    const result = await client.query<TenantOperationRow>(
      `
        select id, status, deletion_scheduled_for
        from tenants
        where id = $1
        limit 1
      `,
      [tenantId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      status: row.status,
      deletionScheduledFor:
        row.deletion_scheduled_for === null
          ? null
          : row.deletion_scheduled_for instanceof Date
            ? row.deletion_scheduled_for
            : new Date(row.deletion_scheduled_for),
    };
  }

  async createSupportAccessSession(
    input: CreateSupportAccessSessionInput,
    client: DatabaseQueryClient,
  ): Promise<SupportAccessSessionRecord> {
    const result = await client.query<SupportAccessRow>(
      `
        insert into platform_support_access_sessions (
          id,
          tenant_id,
          platform_admin_user_id,
          access_mode,
          reason,
          started_at,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          tenant_id,
          platform_admin_user_id,
          access_mode,
          reason,
          started_at,
          expires_at,
          ended_at
      `,
      [
        input.id,
        input.tenantId,
        input.platformAdminUserId,
        input.accessMode,
        input.reason,
        input.startedAt,
        input.expiresAt,
      ],
    );

    return mapSupportAccess(getRequiredRow(result.rows, 'create support access session'));
  }

  async endSupportAccessSession(
    input: {
      readonly id: string;
      readonly endedAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<SupportAccessSessionRecord | null> {
    const result = await client.query<SupportAccessRow>(
      `
        update platform_support_access_sessions
        set ended_at = $2
        where id = $1
          and ended_at is null
        returning
          id,
          tenant_id,
          platform_admin_user_id,
          access_mode,
          reason,
          started_at,
          expires_at,
          ended_at
      `,
      [input.id, input.endedAt],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapSupportAccess(row);
  }

  async applyTenantStatusOverride(
    input: {
      readonly id: string;
      readonly tenantId: string;
      readonly fromStatus: string;
      readonly toStatus: 'read_only' | 'suspended';
      readonly overrideType: string;
      readonly previousValueJson: unknown;
      readonly newValueJson: unknown;
      readonly reason: string;
      readonly expiresAt: Date | null;
      readonly platformAdminUserId: string;
      readonly effectiveAt: Date;
      readonly lifecycleEventId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into subscription_overrides (
          id,
          tenant_id,
          override_type,
          previous_value_json,
          new_value_json,
          reason,
          effective_at,
          expires_at,
          created_by_platform_admin_user_id,
          created_at
        )
        values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $7)
      `,
      [
        input.id,
        input.tenantId,
        input.overrideType,
        JSON.stringify(input.previousValueJson),
        JSON.stringify(input.newValueJson),
        input.reason,
        input.effectiveAt,
        input.expiresAt,
        input.platformAdminUserId,
      ],
    );

    await client.query(
      `
        update tenants
        set
          status = $2,
          updated_at = $3,
          lock_version = lock_version + 1
        where id = $1
      `,
      [input.tenantId, input.toStatus, input.effectiveAt],
    );

    await client.query(
      `
        insert into tenant_lifecycle_events (
          id,
          tenant_id,
          from_status,
          to_status,
          source,
          reason,
          effective_at,
          created_at
        )
        values ($1, $2, $3, $4, 'platform_admin', $5, $6, $6)
      `,
      [
        input.lifecycleEventId,
        input.tenantId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.effectiveAt,
      ],
    );
  }

  async queueTenantDeletionJob(
    input: {
      readonly id: string;
      readonly tenantId: string;
      readonly scheduledFor: Date;
      readonly createdAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into tenant_deletion_jobs (
          id,
          tenant_id,
          scheduled_for,
          status,
          created_at
        )
        values ($1, $2, $3, 'queued', $4)
        on conflict on constraint ux_tenant_deletion_active_job
        do nothing
      `,
      [input.id, input.tenantId, input.scheduledFor, input.createdAt],
    );
  }
}

function mapSupportAccess(row: SupportAccessRow): SupportAccessSessionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platformAdminUserId: row.platform_admin_user_id,
    accessMode: row.access_mode,
    reason: row.reason,
    startedAt: toDate(row.started_at),
    expiresAt: toDate(row.expires_at),
    endedAt: row.ended_at === null ? null : toDate(row.ended_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function getRequiredRow<Row>(rows: readonly Row[], operation: string): Row {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(`Platform tenant operations repository failed to ${operation}.`);
  }

  return row;
}
