import { describe, expect, it } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresPlatformTenantRepository } from './postgres-platform-tenant.repository';

describe('PostgresPlatformTenantRepository platform audit logs', () => {
  it('queries platform_audit_logs with filters and cursor pagination', async () => {
    const client = new RecordingDatabaseClient([
      {
        id: '33333333-3333-4333-8333-333333333333',
        platform_admin_user_id: '11111111-1111-4111-8111-111111111111',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        action: 'platform.tenant_export.queued',
        entity_type: 'background_job',
        entity_id: '44444444-4444-4444-8444-444444444444',
        metadata_json: {
          tenant_status: 'active',
        },
        ip_address: '127.0.0.1',
        user_agent: 'vitest',
        created_at: '2026-06-27T00:00:00.000Z',
      },
    ]);
    const repository = new PostgresPlatformTenantRepository(client);

    const result = await repository.listPlatformAuditLogs({
      limit: 51,
      platformAdminUserId: '11111111-1111-4111-8111-111111111111',
      action: 'platform.tenant_export.queued',
      tenantId: '22222222-2222-4222-8222-222222222222',
      fromCreatedAt: new Date('2026-06-27T00:00:00.000Z'),
      toCreatedAt: new Date('2026-06-28T00:00:00.000Z'),
      cursorCreatedAt: new Date('2026-06-27T03:00:00.000Z'),
      cursorId: '55555555-5555-4555-8555-555555555555',
    });

    expect(client.queries[0]?.sql).toContain('from platform_audit_logs');
    expect(client.queries[0]?.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'platform.tenant_export.queued',
      '22222222-2222-4222-8222-222222222222',
      new Date('2026-06-27T00:00:00.000Z'),
      new Date('2026-06-28T00:00:00.000Z'),
      new Date('2026-06-27T03:00:00.000Z'),
      '55555555-5555-4555-8555-555555555555',
      51,
    ]);
    expect(result[0]).toMatchObject({
      id: '33333333-3333-4333-8333-333333333333',
      platformAdminUserId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'platform.tenant_export.queued',
      entityType: 'background_job',
      entityId: '44444444-4444-4444-8444-444444444444',
      metadataJson: {
        tenant_status: 'active',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      createdAt: new Date('2026-06-27T00:00:00.000Z'),
    });
  });
});

class RecordingDatabaseClient implements DatabaseQueryClient {
  readonly queries: {
    readonly sql: string;
    readonly values: readonly unknown[] | undefined;
  }[] = [];

  constructor(private readonly rows: readonly DatabaseRow[]) {}

  async query<Row extends DatabaseRow = DatabaseRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.queries.push({
      sql,
      values,
    });

    return {
      rows: this.rows as readonly Row[] as Row[],
      rowCount: this.rows.length,
    };
  }
}
