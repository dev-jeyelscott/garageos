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

describe('PostgresPlatformTenantRepository tenant lifecycle candidates', () => {
  it('queries system-computed expired lifecycle-managed tenants with stable ordering', async () => {
    const client = new RecordingDatabaseClient([createTenantDetailRow()]);
    const repository = new PostgresPlatformTenantRepository(client);

    const result = await repository.listTenantLifecycleEvaluationCandidates({
      limit: 25,
      expirationDateOnOrBefore: '2026-06-30',
      cursorExpirationDate: null,
      cursorTenantId: null,
    });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');

    expect(sql).toContain("ts.status_source = 'system_computed'");
    expect(sql).toContain('ts.expiration_date <= $1::date');
    expect(sql).toContain(
      "t.status in ('active', 'grace_period', 'read_only', 'suspended', 'pending_deletion')",
    );
    expect(sql).toContain('$2::date is null');
    expect(sql).toContain('(ts.expiration_date, t.id) > ($2::date, $3::uuid)');
    expect(sql).toContain('order by ts.expiration_date asc, t.id asc');
    expect(sql).toContain('limit $4');
    expect(client.queries[0]?.values).toEqual(['2026-06-30', null, null, 25]);
    expect(result[0]).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      businessName: 'Candidate Motors',
      status: 'read_only',
      onboardingCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletionScheduledFor: null,
      deletedAt: null,
      subscription: {
        expirationDate: '2026-06-29',
        statusSource: 'system_computed',
      },
    });
  });

  it('uses cursor expiration date and tenant id as tuple pagination parameters', async () => {
    const client = new RecordingDatabaseClient([]);
    const repository = new PostgresPlatformTenantRepository(client);

    await repository.listTenantLifecycleEvaluationCandidates({
      limit: 10,
      expirationDateOnOrBefore: '2026-07-01',
      cursorExpirationDate: '2026-06-30',
      cursorTenantId: '33333333-3333-4333-8333-333333333333',
    });

    expect(client.queries[0]?.values).toEqual([
      '2026-07-01',
      '2026-06-30',
      '33333333-3333-4333-8333-333333333333',
      10,
    ]);
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

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createTenantDetailRow(): DatabaseRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    business_name: 'Candidate Motors',
    shop_email: 'owner@candidate.test',
    status: 'read_only',
    duplicate_approved_at: null,
    duplicate_approved_by_platform_admin_user_id: null,
    duplicate_approval_reason: null,
    timezone: 'Asia/Manila',
    country: 'PH',
    currency: 'PHP',
    onboarding_completed_at: '2026-01-02T00:00:00.000Z',
    deletion_scheduled_for: null,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-06-29T00:00:00.000Z',
    lock_version: 3,
    plan_id: '11111111-1111-4111-8111-111111111111',
    plan_code: 'basic',
    plan_name: 'Basic',
    plan_status: 'active',
    subscription_start_date: '2026-01-01',
    subscription_expiration_date: '2026-06-29',
    subscription_status_source: 'system_computed',
    subscription_last_renewal_at: null,
    subscription_updated_by_platform_admin_user_id: null,
    subscription_updated_at: '2026-06-29T00:00:00.000Z',
    owner_user_id: null,
    owner_full_name: null,
    owner_email: null,
    owner_status: null,
    owner_invitation_email: null,
    owner_invitation_status: null,
    owner_invitation_expires_at: null,
  };
}
