import { describe, expect, it } from 'vitest';

import {
  API_AUDIT_SERVICE,
  AUDIT_ACTOR_TYPES,
  AUDIT_RETENTION_CLASSES,
  AuditService,
  type AuditLogRecord,
  type CreateAuditLogInput,
} from './audit';

class CapturingAuditService extends AuditService {
  readonly records: CreateAuditLogInput[] = [];

  async record(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    this.records.push(input);

    return {
      ...input,
      id: 'audit-log-1',
      retentionClass: input.retentionClass ?? AUDIT_RETENTION_CLASSES.STANDARD_3_YEAR,
      createdAt: input.createdAt ?? new Date('2026-06-24T00:00:00.000Z'),
    };
  }
}

describe('audit contract', () => {
  it('exposes a stable dependency-injection token for the future audit implementation', () => {
    expect(API_AUDIT_SERVICE.description).toBe('API_AUDIT_SERVICE');
  });

  it('uses schema-aligned audit actor types', () => {
    expect(Object.values(AUDIT_ACTOR_TYPES)).toEqual(['tenant_user', 'platform_admin', 'system']);
  });

  it('uses the documented minimum standard audit retention class', () => {
    expect(AUDIT_RETENTION_CLASSES.STANDARD_3_YEAR).toBe('standard_3_year');
  });

  it('records a tenant audit event through the shared service boundary', async () => {
    const service = new CapturingAuditService();

    const createdAt = new Date('2026-06-24T01:00:00.000Z');

    const input: CreateAuditLogInput = {
      actor: {
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        actorUserId: '11111111-1111-4111-8111-111111111111',
      },
      action: 'roles.updated',
      entity: {
        tenantId: '22222222-2222-4222-8222-222222222222',
        entityType: 'role',
        entityId: '33333333-3333-4333-8333-333333333333',
      },
      before: {
        permissions: ['customers.read'],
      },
      after: {
        permissions: ['customers.read', 'customers.update'],
      },
      metadata: {
        changed_permission_count: 1,
      },
      reason: 'Update role permissions after owner approval.',
      request: {
        requestId: 'req_01JTEST',
        correlationId: 'corr_01JTEST',
      },
      createdAt,
    };

    const record = await service.record(input);

    expect(service.records).toEqual([input]);
    expect(record).toMatchObject({
      id: 'audit-log-1',
      action: 'roles.updated',
      retentionClass: 'standard_3_year',
      createdAt,
    });
  });

  it('supports platform support actor attribution without impersonating tenant users', async () => {
    const service = new CapturingAuditService();

    const record = await service.record({
      actor: {
        actorType: AUDIT_ACTOR_TYPES.PLATFORM_ADMIN,
        actorUserId: '11111111-1111-4111-8111-111111111111',
        supportAccessSessionId: '22222222-2222-4222-8222-222222222222',
      },
      action: 'support_access.viewed_invoice',
      entity: {
        tenantId: '33333333-3333-4333-8333-333333333333',
        branchId: '44444444-4444-4444-8444-444444444444',
        entityType: 'invoice',
        entityId: '55555555-5555-4555-8555-555555555555',
      },
      reason: 'Investigate reported invoice export issue.',
    });

    expect(record.actor).toEqual({
      actorType: 'platform_admin',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      supportAccessSessionId: '22222222-2222-4222-8222-222222222222',
    });
  });
});
