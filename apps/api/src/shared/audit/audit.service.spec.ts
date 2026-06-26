import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../database/database-client';
import {
  AUDIT_ACTOR_TYPES,
  type AuditLogRecord,
  AuditLogStore,
  type CreateAuditLogInput,
} from './audit-log.store';
import { AuditService } from './audit.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const CREATED_AT = new Date('2026-06-26T00:00:00.000Z');

describe('AuditService', () => {
  it('records a sanitized tenant-user audit log', async () => {
    const { service, store } = createService();

    const record = await service.record({
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
      action: 'auth.login.succeeded',
      entityType: 'user',
      entityId: USER_ID,
      branchId: BRANCH_ID,
      metadataJson: {
        remember_me: true,
        password: 'Secret123',
        nested: {
          refresh_token: 'raw-token',
          safe_value: 'visible',
        },
      },
      ipAddress: '203.0.113.10',
      userAgent: 'GarageOS Test Browser',
      createdAt: CREATED_AT,
    });

    expect(record).toEqual(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'auth.login.succeeded',
        entityType: 'user',
        entityId: USER_ID,
        branchId: BRANCH_ID,
        ipAddress: '203.0.113.10',
        userAgent: 'GarageOS Test Browser',
        retentionClass: 'standard_3_year',
        createdAt: CREATED_AT,
      }),
    );

    expect(store.records).toHaveLength(1);
    expect(record.metadataJson).toEqual({
      remember_me: true,
      password: '[redacted]',
      nested: {
        refresh_token: '[redacted]',
        safe_value: 'visible',
      },
    });
  });

  it('requires a non-empty action and entity type', async () => {
    const { service } = createService();

    await expect(
      service.record({
        actorType: AUDIT_ACTOR_TYPES.SYSTEM,
        action: ' ',
        entityType: 'auth_session',
      }),
    ).rejects.toThrow('Audit action is required.');

    await expect(
      service.record({
        actorType: AUDIT_ACTOR_TYPES.SYSTEM,
        action: 'auth.access_token_denied',
        entityType: ' ',
      }),
    ).rejects.toThrow('Audit entity type is required.');
  });

  it('normalizes forwarded IP addresses to the first address', async () => {
    const { service } = createService();

    const record = await service.record({
      actorType: AUDIT_ACTOR_TYPES.SYSTEM,
      action: 'auth.login.failed',
      entityType: 'auth_login_attempt',
      ipAddress: '203.0.113.10, 198.51.100.20',
    });

    expect(record.ipAddress).toBe('203.0.113.10');
  });
});

function createService(): {
  readonly service: AuditService;
  readonly store: FakeAuditLogStore;
} {
  const store = new FakeAuditLogStore();

  return {
    service: new AuditService(store),
    store,
  };
}

class FakeAuditLogStore extends AuditLogStore {
  readonly records: AuditLogRecord[] = [];

  async create(input: CreateAuditLogInput, _client?: DatabaseQueryClient): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: input.id,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actorType: input.actorType,
      supportAccessSessionId: input.supportAccessSessionId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      branchId: input.branchId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      metadataJson: input.metadataJson,
      reason: input.reason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      retentionClass: input.retentionClass,
      createdAt: input.createdAt,
    };

    this.records.push(record);

    return record;
  }
}
