import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { CreateInventoryAdjustmentService } from '../application/create-inventory-adjustment.service';
import {
  createInventoryAdjustmentRequestSchema,
  type CreateInventoryAdjustmentRequest,
} from './inventory-adjustment.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly createInventoryAdjustmentService: CreateInventoryAdjustmentService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async createInventoryAdjustment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createInventoryAdjustmentRequestSchema))
    request: CreateInventoryAdjustmentRequest,
  ): ReturnType<CreateInventoryAdjustmentService['createDraft']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-adjustments',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.createInventoryAdjustmentService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<CreateInventoryAdjustmentService['createDraft']>
      >;
    }

    try {
      const response = await this.createInventoryAdjustmentService.createDraft(
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
}
