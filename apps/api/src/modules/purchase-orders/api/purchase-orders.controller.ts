import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { ReceivePurchaseOrderService } from '../application/receive-purchase-order.service';
import {
  purchaseOrderIdParamsSchema,
  receivePurchaseOrderRequestSchema,
  type PurchaseOrderIdParams,
  type ReceivePurchaseOrderRequest,
} from './purchase-receiving.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly authService: AuthService,
    private readonly receivePurchaseOrderService: ReceivePurchaseOrderService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post(':purchase_order_id/receivings')
  async receivePurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
    @Body(new ZodValidationPipe(receivePurchaseOrderRequestSchema))
    request: ReceivePurchaseOrderRequest,
  ): ReturnType<ReceivePurchaseOrderService['receive']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders/{purchase_order_id}/receivings',
      idempotencyKey,
      requestIntent: {
        purchase_order_id: params.purchase_order_id,
        ...request,
      },
      now,
      expiresAt: this.receivePurchaseOrderService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ReceivePurchaseOrderService['receive']>
      >;
    }

    try {
      const response = await this.receivePurchaseOrderService.receive(
        params.purchase_order_id,
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
