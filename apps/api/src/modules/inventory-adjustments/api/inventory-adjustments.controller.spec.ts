import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import type { AuthService } from '../../auth/application/auth.service';
import type { ApproveInventoryAdjustmentService } from '../application/approve-inventory-adjustment.service';
import type { CreateInventoryAdjustmentService } from '../application/create-inventory-adjustment.service';
import type { RejectInventoryAdjustmentService } from '../application/reject-inventory-adjustment.service';
import type { SubmitInventoryAdjustmentService } from '../application/submit-inventory-adjustment.service';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '55555555-5555-4555-8555-555555555555';
const adjustmentId = '33333333-3333-4333-8333-333333333333';

describe('InventoryAdjustmentsController', () => {
  it.each([
    ['submitInventoryAdjustment'],
    ['approveInventoryAdjustment'],
    ['rejectInventoryAdjustment'],
  ] as const)('returns 200 OK for %s', (methodName) => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, InventoryAdjustmentsController.prototype[methodName]),
    ).toBe(200);
  });

  it.each([
    ['submitInventoryAdjustment'],
    ['approveInventoryAdjustment'],
    ['rejectInventoryAdjustment'],
  ] as const)('records 200 idempotency success for %s', async (methodName) => {
    const fixture = createFixture();
    const controller = fixture.controller;

    if (methodName === 'submitInventoryAdjustment') {
      await controller.submitInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {});
    } else if (methodName === 'approveInventoryAdjustment') {
      await controller.approveInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {});
    } else {
      await controller.rejectInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {
        reason: 'Rejected after review.',
      });
    }

    expect(fixture.idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'idempotency-record-id',
        responseStatusCode: 200,
      }),
    );
  });
});

function createFixture() {
  const session = createTenantSession();
  const response = { data: { id: adjustmentId } };
  const authService = {
    getAuthenticatedRouteSession: vi.fn().mockResolvedValue({
      tenantContextSession: session,
    }),
  } as unknown as AuthService;
  const createService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
  } as unknown as CreateInventoryAdjustmentService;
  const submitService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    submit: vi.fn().mockResolvedValue(response),
  } as unknown as SubmitInventoryAdjustmentService;
  const approveService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    approve: vi.fn().mockResolvedValue(response),
  } as unknown as ApproveInventoryAdjustmentService;
  const rejectService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    reject: vi.fn().mockResolvedValue(response),
  } as unknown as RejectInventoryAdjustmentService;
  const idempotencyService = {
    begin: vi.fn().mockResolvedValue({
      type: 'started',
      record: { id: 'idempotency-record-id' },
    }),
    completeSucceeded: vi.fn().mockResolvedValue(undefined),
    completeFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdempotencyService;

  return {
    controller: new InventoryAdjustmentsController(
      authService,
      createService,
      submitService,
      approveService,
      rejectService,
      idempotencyService,
    ),
    idempotencyService,
  };
}

function createTenantSession(): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: userId,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: 'active',
    },
    effective_permissions: ['inventory.adjust', 'inventory.adjust.approve'],
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}
