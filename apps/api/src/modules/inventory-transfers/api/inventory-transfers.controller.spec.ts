import { describe, expect, it, vi } from 'vitest';

import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { AuthService } from '../../auth/application/auth.service';
import { CreateInventoryTransferService } from '../application/create-inventory-transfer.service';
import { SendInventoryTransferService } from '../application/send-inventory-transfer.service';
import { SubmitInventoryTransferService } from '../application/submit-inventory-transfer.service';
import { InventoryTransfersController } from './inventory-transfers.controller';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '55555555-5555-4555-8555-555555555555';

describe('InventoryTransfersController', () => {
  it('creates transfers through idempotency and records 201 success', async () => {
    const fixture = createFixture();

    await fixture.controller.createInventoryTransfer('Bearer token', 'idem-key', createRequest());

    expect(fixture.idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        userId,
        endpoint: 'POST /api/v1/inventory-transfers',
        idempotencyKey: 'idem-key',
        requestIntent: createRequest(),
      }),
    );
    expect(fixture.createService.createDraft).toHaveBeenCalledWith(
      createRequest(),
      fixture.session,
    );
    expect(fixture.idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'idempotency-record-id',
        responseStatusCode: 201,
      }),
    );
  });

  it('replays a successful idempotency response without calling the service', async () => {
    const fixture = createFixture({
      idempotencyBegin: {
        type: 'replayed',
        responseBodyJson: { transfer: { id: 'replayed-transfer-id' }, lines: [] },
      },
    });

    const response = await fixture.controller.createInventoryTransfer(
      'Bearer token',
      'idem-key',
      createRequest(),
    );

    expect(response).toEqual({ transfer: { id: 'replayed-transfer-id' }, lines: [] });
    expect(fixture.createService.createDraft).not.toHaveBeenCalled();
  });

  it('records failed idempotency when create throws', async () => {
    const fixture = createFixture();
    fixture.createService.createDraft.mockRejectedValueOnce(new Error('boom'));

    await expect(
      fixture.controller.createInventoryTransfer('Bearer token', 'idem-key', createRequest()),
    ).rejects.toThrow('boom');
    expect(fixture.idempotencyService.completeFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'idempotency-record-id' }),
    );
  });

  it('submits transfers through idempotency and records 200 success', async () => {
    const fixture = createFixture();
    const params = { transfer_id: '22222222-2222-4222-8222-222222222222' };

    await fixture.controller.submitInventoryTransfer('Bearer token', 'submit-key', params);

    expect(fixture.idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        userId,
        endpoint: 'POST /api/v1/inventory-transfers/{transfer_id}/submit',
        idempotencyKey: 'submit-key',
        requestIntent: params,
      }),
    );
    expect(fixture.submitService.submitDraft).toHaveBeenCalledWith(
      params.transfer_id,
      fixture.session,
    );
    expect(fixture.idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'idempotency-record-id',
        responseStatusCode: 200,
      }),
    );
  });

  it('sends transfers through idempotency and records 200 success', async () => {
    const fixture = createFixture();
    const params = { transfer_id: '22222222-2222-4222-8222-222222222222' };
    const request = createSendRequest();

    await fixture.controller.sendInventoryTransfer('Bearer token', 'send-key', params, request);

    expect(fixture.idempotencyService.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        userId,
        endpoint: 'POST /api/v1/inventory-transfers/{transfer_id}/send',
        idempotencyKey: 'send-key',
        requestIntent: { params, body: request },
      }),
    );
    expect(fixture.sendService.sendPending).toHaveBeenCalledWith(
      params.transfer_id,
      request,
      fixture.session,
    );
    expect(fixture.idempotencyService.completeSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'idempotency-record-id',
        responseStatusCode: 200,
      }),
    );
  });
});

function createFixture(
  options: {
    idempotencyBegin?: unknown;
  } = {},
) {
  const session = createTenantSession();
  const authService = {
    getAuthenticatedRouteSession: vi.fn().mockResolvedValue({
      tenantContextSession: session,
    }),
  } as unknown as AuthService;
  const createService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    createDraft: vi.fn().mockResolvedValue({ transfer: { id: 'transfer-id' }, lines: [] }),
  } as unknown as CreateInventoryTransferService & {
    createDraft: ReturnType<typeof vi.fn>;
  };
  const idempotencyService = {
    begin: vi.fn().mockResolvedValue(
      options.idempotencyBegin ?? {
        type: 'started',
        record: { id: 'idempotency-record-id' },
      },
    ),
    completeSucceeded: vi.fn().mockResolvedValue(undefined),
    completeFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdempotencyService;
  const submitService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    submitDraft: vi.fn().mockResolvedValue({ transfer: { id: 'transfer-id' }, reservations: [] }),
  } as unknown as SubmitInventoryTransferService & {
    submitDraft: ReturnType<typeof vi.fn>;
  };
  const sendService = {
    getIdempotencyExpiresAt: vi.fn((now: Date) => new Date(now.getTime() + 60_000)),
    sendPending: vi.fn().mockResolvedValue({ transfer: { id: 'transfer-id' }, lines: [] }),
  } as unknown as SendInventoryTransferService & {
    sendPending: ReturnType<typeof vi.fn>;
  };

  return {
    session,
    createService,
    submitService,
    sendService,
    idempotencyService,
    controller: new InventoryTransfersController(
      authService,
      createService,
      submitService,
      sendService,
      idempotencyService,
    ),
  };
}

function createRequest() {
  return {
    source_branch_id: '22222222-2222-4222-8222-222222222222',
    destination_branch_id: '33333333-3333-4333-8333-333333333333',
    remarks: 'Restock satellite branch.',
    lines: [
      {
        product_id: '44444444-4444-4444-8444-444444444444',
        requested_quantity: '5.000',
      },
    ],
  };
}

function createSendRequest() {
  return {
    lines: [
      {
        line_id: '66666666-6666-4666-8666-666666666666',
        sent_quantity: '5.000',
      },
    ],
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
    effective_permissions: ['inventory.transfer.create'],
    branches: [],
    tenant_wide_branch_access: true,
    subscription_status_source: 'system_computed',
  };
}
