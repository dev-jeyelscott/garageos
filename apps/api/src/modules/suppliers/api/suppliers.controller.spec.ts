import { describe, expect, it, vi } from 'vitest';

import type { IdempotencyKeyRecord } from '../../../shared/idempotency/idempotency-key.store';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { AuthService } from '../../auth/application/auth.service';
import { SupplierService } from '../application/supplier.service';
import { SuppliersController } from './suppliers.controller';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-07-02T00:00:00.000Z');

const SUPPLIER_RESPONSE = {
  supplier: {
    id: SUPPLIER_ID,
    name: 'ACME Parts',
    status: 'active' as const,
    contact_person: 'Maria Santos',
    mobile_number: '+639171234567',
    email: 'parts@example.com',
    address: '123 Supplier Avenue',
    notes: 'Primary supplier',
    lock_version: 1,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    deactivated_at: null,
    reactivated_at: null,
  },
};

const IDEMPOTENCY_RECORD: IdempotencyKeyRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: TENANT_ID,
  userId: USER_ID,
  endpoint: 'POST /api/v1/suppliers',
  requestIntentHash: 'intent-hash',
  idempotencyKeyHash: 'key-hash',
  status: 'processing',
  responseStatusCode: null,
  responseBodyJson: null,
  lockedUntil: null,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
};

describe('SuppliersController', () => {
  it('wraps supplier create in the documented idempotency scope', async () => {
    const { controller, supplierService, idempotencyService } = createController();
    const request = createSupplierRequest();

    const response = await controller.createSupplier(
      'Bearer token',
      'supplier-create-key',
      request,
    );

    expect(response).toEqual(SUPPLIER_RESPONSE);
    expect(idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: 'POST /api/v1/suppliers',
        idempotencyKey: 'supplier-create-key',
        requestIntent: request,
      }),
    );
    expect(supplierService.createSupplier).toHaveBeenCalledWith(request, expect.any(Object));
    expect(idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: IDEMPOTENCY_RECORD.id,
        responseStatusCode: 201,
        responseBodyJson: SUPPLIER_RESPONSE,
      }),
    );
  });

  it('replays an already-successful supplier create response without executing the service write', async () => {
    const { controller, supplierService, idempotencyService } = createController({
      beginResult: {
        type: 'replayed',
        record: {
          ...IDEMPOTENCY_RECORD,
          status: 'succeeded',
          responseStatusCode: 201,
          responseBodyJson: SUPPLIER_RESPONSE,
        },
        responseStatusCode: 201,
        responseBodyJson: SUPPLIER_RESPONSE,
      },
    });

    const response = await controller.createSupplier(
      'Bearer token',
      'supplier-create-key',
      createSupplierRequest(),
    );

    expect(response).toEqual(SUPPLIER_RESPONSE);
    expect(supplierService.createSupplier).not.toHaveBeenCalled();
    expect(idempotencyService.completeSucceeded).not.toHaveBeenCalled();
  });

  it('marks idempotency failed when supplier create fails', async () => {
    const { controller, supplierService, idempotencyService } = createController();
    const error = new Error('write failed');

    vi.mocked(supplierService.createSupplier).mockRejectedValueOnce(error);

    await expect(
      controller.createSupplier('Bearer token', 'supplier-create-key', createSupplierRequest()),
    ).rejects.toBe(error);

    expect(idempotencyService.completeFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: IDEMPOTENCY_RECORD.id }),
    );
  });

  it('wraps supplier deactivate in a status-action idempotency scope', async () => {
    const { controller, supplierService, idempotencyService } = createController();

    const response = await controller.deactivateSupplier(
      'Bearer token',
      'supplier-deactivate-key',
      SUPPLIER_ID,
      {},
    );

    expect(response).toEqual(SUPPLIER_RESPONSE);
    expect(idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        endpoint: 'POST /api/v1/suppliers/{supplier_id}/deactivate',
        idempotencyKey: 'supplier-deactivate-key',
        requestIntent: { supplier_id: SUPPLIER_ID },
      }),
    );
    expect(supplierService.deactivateSupplier).toHaveBeenCalledWith(
      SUPPLIER_ID,
      {},
      expect.any(Object),
    );
    expect(idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatusCode: 200 }),
    );
  });

  it('wraps supplier reactivate in a status-action idempotency scope', async () => {
    const { controller, supplierService, idempotencyService } = createController();

    const response = await controller.reactivateSupplier(
      'Bearer token',
      'supplier-reactivate-key',
      SUPPLIER_ID,
      { reason: 'Supplier is active again.' },
    );

    expect(response).toEqual(SUPPLIER_RESPONSE);
    expect(idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'POST /api/v1/suppliers/{supplier_id}/reactivate',
        idempotencyKey: 'supplier-reactivate-key',
        requestIntent: {
          supplier_id: SUPPLIER_ID,
          reason: 'Supplier is active again.',
        },
      }),
    );
    expect(supplierService.reactivateSupplier).toHaveBeenCalledWith(
      SUPPLIER_ID,
      { reason: 'Supplier is active again.' },
      expect.any(Object),
    );
    expect(idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatusCode: 200 }),
    );
  });
});

function createController(
  options: {
    readonly beginResult?: Awaited<ReturnType<IdempotencyService['begin']>>;
  } = {},
): {
  readonly controller: SuppliersController;
  readonly authService: AuthService;
  readonly supplierService: SupplierService;
  readonly idempotencyService: IdempotencyService;
} {
  const authService = {
    getAuthenticatedRouteSession: vi.fn(async () => ({
      tenantContextSession: createTenantSession(),
    })),
  } as unknown as AuthService;

  const supplierService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    createSupplier: vi.fn(async () => SUPPLIER_RESPONSE),
    deactivateSupplier: vi.fn(async () => SUPPLIER_RESPONSE),
    reactivateSupplier: vi.fn(async () => SUPPLIER_RESPONSE),
  } as unknown as SupplierService;

  const idempotencyService = {
    begin: vi.fn(
      async () => options.beginResult ?? { type: 'started', record: IDEMPOTENCY_RECORD },
    ),
    completeSucceeded: vi.fn(async () => undefined),
    completeFailed: vi.fn(async () => undefined),
  } as unknown as IdempotencyService;

  return {
    controller: new SuppliersController(authService, supplierService, idempotencyService),
    authService,
    supplierService,
    idempotencyService,
  };
}

function createTenantSession(): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: TENANT_ID,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: 'active',
    },
    effective_permissions: [
      'suppliers.read',
      'suppliers.create',
      'suppliers.update',
      'suppliers.deactivate',
    ],
    branches: [],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

function createSupplierRequest() {
  return {
    name: 'ACME Parts',
    contact_person: 'Maria Santos',
    mobile_number: '+639171234567',
    email: 'parts@example.com',
    address: '123 Supplier Avenue',
    notes: 'Primary supplier',
  };
}
