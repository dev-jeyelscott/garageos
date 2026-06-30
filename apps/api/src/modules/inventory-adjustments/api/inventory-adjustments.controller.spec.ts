import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { AuthService } from '../../auth/application/auth.service';
import { ApproveInventoryAdjustmentService } from '../application/approve-inventory-adjustment.service';
import { CancelInventoryAdjustmentService } from '../application/cancel-inventory-adjustment.service';
import { CreateInventoryAdjustmentService } from '../application/create-inventory-adjustment.service';
import { ForceInventoryAdjustmentService } from '../application/force-inventory-adjustment.service';
import { PostInventoryAdjustmentService } from '../application/post-inventory-adjustment.service';
import { RejectInventoryAdjustmentService } from '../application/reject-inventory-adjustment.service';
import { SubmitInventoryAdjustmentService } from '../application/submit-inventory-adjustment.service';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '55555555-5555-4555-8555-555555555555';
const adjustmentId = '33333333-3333-4333-8333-333333333333';

describe('InventoryAdjustmentsController', () => {
  it.each([
    ['submitInventoryAdjustment'],
    ['approveInventoryAdjustment'],
    ['rejectInventoryAdjustment'],
    ['cancelInventoryAdjustment'],
    ['postInventoryAdjustment'],
    ['forceInventoryAdjustment'],
  ] as const)('returns 200 OK for %s', (methodName) => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, InventoryAdjustmentsController.prototype[methodName]),
    ).toBe(200);
  });

  it.each([
    ['submitInventoryAdjustment'],
    ['approveInventoryAdjustment'],
    ['rejectInventoryAdjustment'],
    ['cancelInventoryAdjustment'],
    ['postInventoryAdjustment'],
    ['forceInventoryAdjustment'],
  ] as const)('records 200 idempotency success for %s', async (methodName) => {
    const fixture = createFixture();
    const controller = fixture.controller;

    if (methodName === 'submitInventoryAdjustment') {
      await controller.submitInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {});
    } else if (methodName === 'approveInventoryAdjustment') {
      await controller.approveInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {});
    } else if (methodName === 'rejectInventoryAdjustment') {
      await controller.rejectInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {
        reason: 'Rejected after review.',
      });
    } else if (methodName === 'cancelInventoryAdjustment') {
      await controller.cancelInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {
        reason: 'Cancelled before posting.',
      });
    } else if (methodName === 'postInventoryAdjustment') {
      await controller.postInventoryAdjustment('Bearer token', 'idem-key', adjustmentId, {});
    } else {
      await controller.forceInventoryAdjustment('Bearer token', 'idem-key', {
        branch_id: '22222222-2222-4222-8222-222222222222',
        reason: 'Correct exceptional count drift.',
        lines: [
          {
            product_id: '44444444-4444-4444-8444-444444444444',
            quantity_difference: '1.000',
          },
        ],
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
  const cancelService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    cancel: vi.fn().mockResolvedValue(response),
  } as unknown as CancelInventoryAdjustmentService;
  const rejectService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    reject: vi.fn().mockResolvedValue(response),
  } as unknown as RejectInventoryAdjustmentService;
  const postService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    post: vi.fn().mockResolvedValue(response),
  } as unknown as PostInventoryAdjustmentService;
  const forceService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    forceAdjust: vi.fn().mockResolvedValue(response),
  } as unknown as ForceInventoryAdjustmentService;
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
      cancelService,
      rejectService,
      postService,
      forceService,
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
