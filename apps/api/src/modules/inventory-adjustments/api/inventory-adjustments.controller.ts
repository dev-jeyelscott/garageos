import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { ApproveInventoryAdjustmentService } from '../application/approve-inventory-adjustment.service';
import { CreateInventoryAdjustmentService } from '../application/create-inventory-adjustment.service';
import { RejectInventoryAdjustmentService } from '../application/reject-inventory-adjustment.service';
import { SubmitInventoryAdjustmentService } from '../application/submit-inventory-adjustment.service';
import {
  approveInventoryAdjustmentRequestSchema,
  rejectInventoryAdjustmentRequestSchema,
  submitInventoryAdjustmentRequestSchema,
  type ApproveInventoryAdjustmentRequest,
  type RejectInventoryAdjustmentRequest,
  type SubmitInventoryAdjustmentRequest,
} from './inventory-adjustment-action.schemas';
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
    private readonly submitInventoryAdjustmentService: SubmitInventoryAdjustmentService,
    private readonly approveInventoryAdjustmentService: ApproveInventoryAdjustmentService,
    private readonly rejectInventoryAdjustmentService: RejectInventoryAdjustmentService,
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

  @Post(':adjustment_id/submit')
  async submitInventoryAdjustment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('adjustment_id') adjustmentId: string,
    @Body(new ZodValidationPipe(submitInventoryAdjustmentRequestSchema))
    request: SubmitInventoryAdjustmentRequest,
  ): ReturnType<SubmitInventoryAdjustmentService['submit']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-adjustments/{adjustment_id}/submit',
      idempotencyKey,
      requestIntent: { adjustment_id: adjustmentId, ...request },
      now,
      expiresAt: this.submitInventoryAdjustmentService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SubmitInventoryAdjustmentService['submit']>
      >;
    }

    try {
      const response = await this.submitInventoryAdjustmentService.submit(
        adjustmentId,
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

  @Post(':adjustment_id/approve')
  async approveInventoryAdjustment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('adjustment_id') adjustmentId: string,
    @Body(new ZodValidationPipe(approveInventoryAdjustmentRequestSchema))
    request: ApproveInventoryAdjustmentRequest,
  ): ReturnType<ApproveInventoryAdjustmentService['approve']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-adjustments/{adjustment_id}/approve',
      idempotencyKey,
      requestIntent: { adjustment_id: adjustmentId, ...request },
      now,
      expiresAt: this.approveInventoryAdjustmentService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ApproveInventoryAdjustmentService['approve']>
      >;
    }

    try {
      const response = await this.approveInventoryAdjustmentService.approve(
        adjustmentId,
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

  @Post(':adjustment_id/reject')
  async rejectInventoryAdjustment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('adjustment_id') adjustmentId: string,
    @Body(new ZodValidationPipe(rejectInventoryAdjustmentRequestSchema))
    request: RejectInventoryAdjustmentRequest,
  ): ReturnType<RejectInventoryAdjustmentService['reject']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/inventory-adjustments/{adjustment_id}/reject',
      idempotencyKey,
      requestIntent: { adjustment_id: adjustmentId, ...request },
      now,
      expiresAt: this.rejectInventoryAdjustmentService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<RejectInventoryAdjustmentService['reject']>
      >;
    }

    try {
      const response = await this.rejectInventoryAdjustmentService.reject(
        adjustmentId,
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
