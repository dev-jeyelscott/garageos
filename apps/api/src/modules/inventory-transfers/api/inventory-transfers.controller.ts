import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { CreateInventoryTransferService } from '../application/create-inventory-transfer.service';
import { SendInventoryTransferService } from '../application/send-inventory-transfer.service';
import { SubmitInventoryTransferService } from '../application/submit-inventory-transfer.service';
import {
  createInventoryTransferRequestSchema,
  type CreateInventoryTransferRequest,
  inventoryTransferIdParamsSchema,
  type InventoryTransferIdParams,
  sendInventoryTransferRequestSchema,
  type SendInventoryTransferRequest,
} from './inventory-transfer.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('inventory-transfers')
export class InventoryTransfersController {
  constructor(
    private readonly authService: AuthService,
    private readonly createInventoryTransferService: CreateInventoryTransferService,
    private readonly submitInventoryTransferService: SubmitInventoryTransferService,
    private readonly sendInventoryTransferService: SendInventoryTransferService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async createInventoryTransfer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createInventoryTransferRequestSchema))
    request: CreateInventoryTransferRequest,
  ): ReturnType<CreateInventoryTransferService['createDraft']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-transfers',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.createInventoryTransferService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<CreateInventoryTransferService['createDraft']>
      >;
    }

    try {
      const response = await this.createInventoryTransferService.createDraft(
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 201,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }

  @Post(':transfer_id/submit')
  async submitInventoryTransfer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(inventoryTransferIdParamsSchema))
    params: InventoryTransferIdParams,
  ): ReturnType<SubmitInventoryTransferService['submitDraft']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-transfers/{transfer_id}/submit',
      idempotencyKey,
      requestIntent: params,
      now,
      expiresAt: this.submitInventoryTransferService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SubmitInventoryTransferService['submitDraft']>
      >;
    }

    try {
      const response = await this.submitInventoryTransferService.submitDraft(
        params.transfer_id,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 200,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }

  @Post(':transfer_id/send')
  async sendInventoryTransfer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(inventoryTransferIdParamsSchema))
    params: InventoryTransferIdParams,
    @Body(new ZodValidationPipe(sendInventoryTransferRequestSchema))
    request: SendInventoryTransferRequest,
  ): ReturnType<SendInventoryTransferService['sendPending']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = { params, body: request };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-transfers/{transfer_id}/send',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.sendInventoryTransferService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SendInventoryTransferService['sendPending']>
      >;
    }

    try {
      const response = await this.sendInventoryTransferService.sendPending(
        params.transfer_id,
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 200,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }
}
