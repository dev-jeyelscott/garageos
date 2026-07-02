import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

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
import {
  purchaseOrderListQuerySchema,
  type PurchaseOrderListQuery,
} from './purchase-order-query.schemas';
import { PurchaseOrderDraftService } from '../application/purchase-order-draft.service';
import { PurchaseOrderLifecycleService } from '../application/purchase-order-lifecycle.service';
import { PurchaseOrderQueryService } from '../application/purchase-order-query.service';
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
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(PurchaseOrderQueryService)
    private readonly purchaseOrderQueryService: PurchaseOrderQueryService,
    @Inject(PurchaseOrderDraftService)
    private readonly purchaseOrderDraftService: PurchaseOrderDraftService,
    @Inject(PurchaseOrderLifecycleService)
    private readonly purchaseOrderLifecycleService: PurchaseOrderLifecycleService,
    @Inject(ReceivePurchaseOrderService)
    private readonly receivePurchaseOrderService: ReceivePurchaseOrderService,
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listPurchaseOrders(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(purchaseOrderListQuerySchema)) query: PurchaseOrderListQuery,
  ): ReturnType<PurchaseOrderQueryService['listPurchaseOrders']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.purchaseOrderQueryService.listPurchaseOrders(query, session.tenantContextSession);
  }

  @Get(':purchase_order_id')
  async getPurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
  ): ReturnType<PurchaseOrderQueryService['getPurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.purchaseOrderQueryService.getPurchaseOrder(
      params.purchase_order_id,
      session.tenantContextSession,
    );
  }

  @Post()
  async createPurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createPurchaseOrderRequestSchema))
    request: CreatePurchaseOrderRequest,
  ): ReturnType<PurchaseOrderDraftService['createPurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/purchase-orders',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.purchaseOrderDraftService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderDraftService['createPurchaseOrder']>
      >;
    }

    try {
      const response = await this.purchaseOrderDraftService.createPurchaseOrder(
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

  @Patch(':purchase_order_id')
  async updatePurchaseOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(purchaseOrderIdParamsSchema))
    params: PurchaseOrderIdParams,
    @Body(new ZodValidationPipe(updatePurchaseOrderRequestSchema))
    request: UpdatePurchaseOrderRequest,
  ): ReturnType<PurchaseOrderDraftService['updatePurchaseOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.purchaseOrderDraftService.updatePurchaseOrder(
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
      expiresAt: this.purchaseOrderLifecycleService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['orderPurchaseOrder']>
      >;
    }

    try {
      const response = await this.purchaseOrderLifecycleService.orderPurchaseOrder(
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
      expiresAt: this.purchaseOrderLifecycleService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['cancelPurchaseOrder']>
      >;
    }

    try {
      const response = await this.purchaseOrderLifecycleService.cancelPurchaseOrder(
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
      expiresAt: this.purchaseOrderLifecycleService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PurchaseOrderLifecycleService['closePurchaseOrder']>
      >;
    }

    try {
      const response = await this.purchaseOrderLifecycleService.closePurchaseOrder(
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
}
