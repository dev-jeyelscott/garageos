import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { AuditLogRecord } from '../../../shared/audit/audit-log.store';
import type { AuditService } from '../../../shared/audit/audit.service';
import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import { SecureTokenService } from '../../auth/application/secure-token.service';
import { TokenHashingService } from '../../auth/application/token-hashing.service';
import type { AuthSessionResponseData } from '../../auth/contracts';
import {
  type CreateOwnerInvitationInput,
  type CreateTenantInput,
  type CreateTenantLifecycleEventInput,
  type CreateTenantSubscriptionInput,
  type ListPlatformTenantsInput,
  type PlatformPlanSummary,
  type PlatformSubscriptionSummary,
  type PlatformTenantDetailRecord,
  type PlatformTenantListRecord,
  type PlatformTenantOwnerInvitationSummary,
  PlatformTenantStore,
} from './platform-tenant.store';
import { PLATFORM_PERMISSIONS, PlatformTenantService } from './platform-tenant.service';

const PLATFORM_ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-06-27T00:00:00.000Z');

describe('PlatformTenantService', () => {
  it('requires a verified platform admin with the requested platform permission', () => {
    const { service } = createService();

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          {
            ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
            user: {
              ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]).user,
              user_type: 'tenant_user',
            },
          },
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          {
            ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
            user: {
              ...createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]).user,
              email_verified: false,
            },
          },
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );

    expectForbidden(
      () =>
        service.assertPlatformPermission(
          createPlatformSession([]),
          PLATFORM_PERMISSIONS.TENANTS_READ,
        ),
      PLATFORM_PERMISSIONS.TENANTS_READ,
    );
  });

  it('lists tenants with API-safe pagination metadata', async () => {
    const { service, store } = createService();
    store.listRows = [
      createTenantRecord({
        id: '55555555-5555-4555-8555-555555555555',
        businessName: 'Moto Garage',
        createdAt: new Date('2026-06-27T03:00:00.000Z'),
      }),
      createTenantRecord({
        id: '66666666-6666-4666-8666-666666666666',
        businessName: 'Second Garage',
        createdAt: new Date('2026-06-27T02:00:00.000Z'),
      }),
    ];

    const response = await service.listTenants(
      {
        limit: 1,
        q: ' garage ',
      },
      createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_READ]),
    );

    expect(store.listInputs[0]).toMatchObject({
      limit: 2,
      search: 'garage',
    });
    expect(response.tenants).toHaveLength(1);
    expect(response.tenants[0]).toMatchObject({
      business_name: 'Moto Garage',
      status: 'pending_setup',
    });
    expect(response.pagination).toMatchObject({
      limit: 1,
      has_more: true,
    });
    expect(response.pagination.next_cursor).toEqual(expect.any(String));
  });

  it('creates a pending setup tenant with subscription baseline, owner invitation, lifecycle event, and audit logs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    try {
      const { service, store, auditService } = createService();

      const response = await service.createTenant(
        createTenantRequest(),
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      );

      expect(response).toMatchObject({
        tenant: {
          business_name: 'Moto Garage',
          status: 'pending_setup',
        },
        subscription: {
          plan_id: PLAN_ID,
          start_date: '2026-06-27',
          expiration_date: '2026-07-27',
          status_source: 'system_computed',
        },
        owner_invitation_sent: true,
      });

      expect(store.createdTenants[0]).toMatchObject({
        businessName: 'Moto Garage',
        normalizedBusinessName: 'moto garage',
        shopEmail: 'Owner@MotoGarage.test',
        normalizedShopEmail: 'owner@motogarage.test',
        status: 'pending_setup',
      });
      expect(store.createdSubscriptions[0]).toMatchObject({
        planId: PLAN_ID,
        startDate: '2026-06-27',
        expirationDate: '2026-07-27',
        updatedByPlatformAdminUserId: PLATFORM_ADMIN_USER_ID,
      });
      expect(store.createdInvitations[0]).toMatchObject({
        email: 'owner@motogarage.test',
        normalizedEmail: 'owner@motogarage.test',
        status: 'pending',
        assignedRoleConfigJson: {
          role_type: 'shop_owner',
          protected_owner_capabilities: true,
        },
      });
      expect(store.lifecycleEvents[0]).toMatchObject({
        fromStatus: null,
        toStatus: 'pending_setup',
        source: 'platform_admin',
      });
      expect(auditService.record).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks duplicate non-deleted tenant business/email combinations before creating records', async () => {
    const { service, store } = createService();
    store.duplicate = createTenantRecord({
      id: TENANT_ID,
      businessName: 'Moto Garage',
    });

    await expect(
      service.createTenant(
        createTenantRequest(),
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
    });

    expect(store.createdTenants).toEqual([]);
  });

  it('requires an active subscription plan', async () => {
    const { service, store } = createService();
    store.plan = null;

    await expect(
      service.createTenant(
        createTenantRequest(),
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'plan_id',
          code: 'active_plan_required',
        }),
      ],
    });
  });

  it('rejects an expiration date before the start date', async () => {
    const { service } = createService();

    await expect(
      service.createTenant(
        {
          ...createTenantRequest(),
          subscription_expiration_date: '2026-06-26',
        },
        createPlatformSession([PLATFORM_PERMISSIONS.TENANTS_CREATE]),
        {
          ipAddress: null,
          userAgent: null,
        },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        expect.objectContaining({
          field: 'subscription_expiration_date',
          code: 'date_before_start',
        }),
      ],
    });
  });
});

function createService(): {
  readonly service: PlatformTenantService;
  readonly store: FakePlatformTenantStore;
  readonly auditService: AuditService;
} {
  const store = new FakePlatformTenantStore();
  const auditService = {
    record: vi.fn(
      async (input: unknown): Promise<AuditLogRecord> => ({
        id: 'audit-id',
        tenantId: null,
        actorUserId: null,
        actorType: 'platform_admin',
        supportAccessSessionId: null,
        action:
          typeof input === 'object' && input !== null && 'action' in input
            ? String(input.action)
            : 'test.audit',
        entityType:
          typeof input === 'object' && input !== null && 'entityType' in input
            ? String(input.entityType)
            : 'test',
        entityId: null,
        branchId: null,
        beforeJson: null,
        afterJson: null,
        metadataJson: null,
        reason: null,
        ipAddress: null,
        userAgent: null,
        retentionClass: 'standard_3_year',
        createdAt: NOW,
      }),
    ),
  } as unknown as AuditService;

  return {
    service: new PlatformTenantService(
      store,
      new FakeTransactionRunner(),
      auditService,
      new SecureTokenService(),
      new TokenHashingService(),
    ),
    store,
    auditService,
  };
}

function createTenantRequest() {
  return {
    business_name: 'Moto Garage',
    shop_email: 'Owner@MotoGarage.test',
    plan_id: PLAN_ID,
    subscription_start_date: '2026-06-27',
    subscription_expiration_date: '2026-07-27',
    owner: {
      full_name: 'Juan Dela Cruz',
      email: 'owner@motogarage.test',
      send_invitation: true as const,
    },
    duplicate_approval_reason: null,
  };
}

function createPlatformSession(permissions: readonly string[]): AuthSessionResponseData {
  return {
    user: {
      id: PLATFORM_ADMIN_USER_ID,
      user_type: 'platform_admin',
      full_name: 'Platform Admin',
      email: 'admin@garageos.test',
      email_verified: true,
      status: 'active',
    },
    tenant: null,
    effective_permissions: permissions,
    branches: [],
    tenant_wide_branch_access: false,
    effective_plan: null,
    subscription: null,
    access: {
      can_access_operational_modules: false,
      read_only: false,
    },
  };
}

function createTenantRecord(
  overrides: Partial<PlatformTenantDetailRecord> = {},
): PlatformTenantDetailRecord {
  const createdAt = overrides.createdAt ?? NOW;

  return {
    id: overrides.id ?? TENANT_ID,
    businessName: overrides.businessName ?? 'Moto Garage',
    shopEmail: overrides.shopEmail ?? 'owner@motogarage.test',
    status: overrides.status ?? 'pending_setup',
    timezone: overrides.timezone ?? 'Asia/Manila',
    country: overrides.country ?? 'PH',
    currency: overrides.currency ?? 'PHP',
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    lockVersion: overrides.lockVersion ?? 0,
    plan: overrides.plan ?? null,
    subscription: overrides.subscription ?? null,
    owner: overrides.owner ?? null,
    ownerInvitation: overrides.ownerInvitation ?? null,
    onboardingCompletedAt: overrides.onboardingCompletedAt ?? null,
    deletionScheduledFor: overrides.deletionScheduledFor ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function createSubscriptionRecord(
  overrides: Partial<PlatformSubscriptionSummary> = {},
): PlatformSubscriptionSummary {
  return {
    planId: overrides.planId ?? PLAN_ID,
    startDate: overrides.startDate ?? '2026-06-27',
    expirationDate: overrides.expirationDate ?? '2026-07-27',
    statusSource: overrides.statusSource ?? 'system_computed',
    lastRenewalAt: overrides.lastRenewalAt ?? null,
    updatedByPlatformAdminUserId: overrides.updatedByPlatformAdminUserId ?? PLATFORM_ADMIN_USER_ID,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function expectForbidden(action: () => unknown, requiredPermission: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.FORBIDDEN);
    expect((error as GarageOsApiException).details).toEqual([
      {
        required_permission: requiredPermission,
      },
    ]);
    return;
  }

  throw new Error('Expected forbidden error.');
}

const FAKE_DATABASE_CLIENT: DatabaseQueryClient = {
  async query<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseQueryResult<Row>> {
    return {
      rows: [],
      rowCount: 0,
    };
  },
};

class FakeTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work(FAKE_DATABASE_CLIENT);
  }
}

class FakePlatformTenantStore extends PlatformTenantStore {
  listRows: PlatformTenantListRecord[] = [];
  plan: PlatformPlanSummary | null = {
    id: PLAN_ID,
    code: 'basic',
    name: 'Basic',
    status: 'active',
  };
  duplicate: PlatformTenantDetailRecord | null = null;
  readonly listInputs: ListPlatformTenantsInput[] = [];
  readonly createdTenants: CreateTenantInput[] = [];
  readonly createdSubscriptions: CreateTenantSubscriptionInput[] = [];
  readonly createdInvitations: CreateOwnerInvitationInput[] = [];
  readonly lifecycleEvents: CreateTenantLifecycleEventInput[] = [];

  async listTenants(input: ListPlatformTenantsInput): Promise<readonly PlatformTenantListRecord[]> {
    this.listInputs.push(input);

    return this.listRows;
  }

  async findTenantById(): Promise<PlatformTenantDetailRecord | null> {
    return null;
  }

  async findActivePlanById(): Promise<PlatformPlanSummary | null> {
    return this.plan;
  }

  async findNonDeletedTenantByBusinessEmail(): Promise<PlatformTenantDetailRecord | null> {
    return this.duplicate;
  }

  async createTenant(input: CreateTenantInput): Promise<PlatformTenantDetailRecord> {
    this.createdTenants.push(input);

    return createTenantRecord({
      id: input.id,
      businessName: input.businessName,
      shopEmail: input.shopEmail,
      status: input.status,
      createdAt: input.createdAt,
    });
  }

  async createTenantSubscription(
    input: CreateTenantSubscriptionInput,
  ): Promise<PlatformSubscriptionSummary> {
    this.createdSubscriptions.push(input);

    return createSubscriptionRecord({
      planId: input.planId,
      startDate: input.startDate,
      expirationDate: input.expirationDate,
      updatedByPlatformAdminUserId: input.updatedByPlatformAdminUserId,
      updatedAt: input.updatedAt,
    });
  }

  async createOwnerInvitation(
    input: CreateOwnerInvitationInput,
  ): Promise<PlatformTenantOwnerInvitationSummary> {
    this.createdInvitations.push(input);

    return {
      email: input.email,
      status: input.status,
      expiresAt: input.expiresAt,
    };
  }

  async createTenantLifecycleEvent(input: CreateTenantLifecycleEventInput): Promise<void> {
    this.lifecycleEvents.push(input);
  }
}
