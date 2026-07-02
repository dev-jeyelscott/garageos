import { Body, Controller, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import {
  createPurchaseOrderRequestSchema,
  purchaseOrderIdParamsSchema,
  type CreatePurchaseOrderRequest,
  type PurchaseOrderIdParams,
  updatePurchaseOrderRequestSchema,
  type UpdatePurchaseOrderRequest,
} from './purchase-order-draft.schemas';
import { PurchaseOrderDraftService } from '../application/purchase-order-draft.service';
import { PurchaseOrderLifecycleService } from '../application/purchase-order-lifecycle.service';
import {
  cancelPurchaseOrderRequestSchema,
  type CancelPurchaseOrderRequest,
} from './purchase-order-lifecycle.schemas';
import { ReceivePurchaseOrderService } from '../application/receive-purchase-order.service';
import {
  receivePurchaseOrderRequestSchema,
  type ReceivePurchaseOrderRequest,
} from './purchase-receiving.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly authService: AuthService,
    private readonly receivePurchaseOrderService: ReceivePurchaseOrderService,
    private readonly idempotencyService: IdempotencyService,
    private readonly purchaseOrderDraftService?: PurchaseOrderDraftService,
    private readonly purchaseOrderLifecycleService?: PurchaseOrderLifecycleService,
  ) {}

  @Post()
  async createPurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createPurchaseOrderRequestSchema))
    request: CreatePurchaseOrderRequest,
  ): ReturnType<PurchaseOrderDraftService['createPurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const service = this.getPurchaseOrderDraftService();
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: service.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderDraftService['createPurchaseOrder']>
      >;
    }

    try {
      const response = await service.createPurchaseOrder(request, session.tenantContextSession);

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

  @Patch(':purchase_order_id')
  async updatePurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
    @Body(new ZodValidationPipe(updatePurchaseOrderRequestSchema))
    request: UpdatePurchaseOrderRequest,
  ): ReturnType<PurchaseOrderDraftService['updatePurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.getPurchaseOrderDraftService().updatePurchaseOrder(
      params.purchase_order_id,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':purchase_order_id/order')
  async orderPurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
  ): ReturnType<PurchaseOrderLifecycleService['orderPurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const service = this.getPurchaseOrderLifecycleService();
    const now = new Date();
    const requestIntent = {
      purchase_order_id: params.purchase_order_id,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders/{purchase_order_id}/order',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: service.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['orderPurchaseOrder']>
      >;
    }

    try {
      const response = await service.orderPurchaseOrder(
        params.purchase_order_id,
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

  @Post(':purchase_order_id/cancel')
  async cancelPurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
    @Body(new ZodValidationPipe(cancelPurchaseOrderRequestSchema))
    request: CancelPurchaseOrderRequest,
  ): ReturnType<PurchaseOrderLifecycleService['cancelPurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const service = this.getPurchaseOrderLifecycleService();
    const now = new Date();
    const requestIntent = {
      purchase_order_id: params.purchase_order_id,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders/{purchase_order_id}/cancel',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: service.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['cancelPurchaseOrder']>
      >;
    }

    try {
      const response = await service.cancelPurchaseOrder(
        params.purchase_order_id,
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

  @Post(':purchase_order_id/close')
  async closePurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
  ): ReturnType<PurchaseOrderLifecycleService['closePurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const service = this.getPurchaseOrderLifecycleService();
    const now = new Date();
    const requestIntent = {
      purchase_order_id: params.purchase_order_id,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders/{purchase_order_id}/close',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: service.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['closePurchaseOrder']>
      >;
    }

    try {
      const response = await service.closePurchaseOrder(
        params.purchase_order_id,
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

  private getPurchaseOrderDraftService(): PurchaseOrderDraftService {
    if (this.purchaseOrderDraftService === undefined) {
      throw new Error('Purchase order draft service is not configured.');
    }

    return this.purchaseOrderDraftService;
  }

  private getPurchaseOrderLifecycleService(): PurchaseOrderLifecycleService {
    if (this.purchaseOrderLifecycleService === undefined) {
      throw new Error('Purchase order lifecycle service is not configured.');
    }

    return this.purchaseOrderLifecycleService;
  }
}
