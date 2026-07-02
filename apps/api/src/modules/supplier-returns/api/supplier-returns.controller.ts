import {
  Body,
  Controller,
  Get,
  Headers,
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
import { SupplierReturnService } from '../application/supplier-return.service';
import {
  cancelSupplierReturnRequestSchema,
  createSupplierReturnRequestSchema,
  listSupplierReturnsQuerySchema,
  supplierReturnIdParamsSchema,
  updateSupplierReturnRequestSchema,
  type CancelSupplierReturnRequest,
  type CreateSupplierReturnRequest,
  type ListSupplierReturnsQuery,
  type SupplierReturnIdParams,
  type UpdateSupplierReturnRequest,
} from './supplier-return.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(
    private readonly authService: AuthService,
    private readonly supplierReturnService: SupplierReturnService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listSupplierReturns(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listSupplierReturnsQuerySchema)) query: ListSupplierReturnsQuery,
  ): ReturnType<SupplierReturnService['listSupplierReturns']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierReturnService.listSupplierReturns(query, session.tenantContextSession);
  }

  @Post()
  async createSupplierReturn(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createSupplierReturnRequestSchema))
    request: CreateSupplierReturnRequest,
  ): ReturnType<SupplierReturnService['createSupplierReturn']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/supplier-returns',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.supplierReturnService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierReturnService['createSupplierReturn']>
      >;
    }

    try {
      const response = await this.supplierReturnService.createSupplierReturn(
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

  @Get(':supplier_return_id')
  async getSupplierReturn(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(supplierReturnIdParamsSchema))
    params: SupplierReturnIdParams,
  ): ReturnType<SupplierReturnService['getSupplierReturn']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierReturnService.getSupplierReturn(
      params.supplier_return_id,
      session.tenantContextSession,
    );
  }

  @Patch(':supplier_return_id')
  async updateSupplierReturn(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(supplierReturnIdParamsSchema))
    params: SupplierReturnIdParams,
    @Body(new ZodValidationPipe(updateSupplierReturnRequestSchema))
    request: UpdateSupplierReturnRequest,
  ): ReturnType<SupplierReturnService['updateSupplierReturn']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierReturnService.updateSupplierReturn(
      params.supplier_return_id,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':supplier_return_id/post')
  async postSupplierReturn(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(supplierReturnIdParamsSchema))
    params: SupplierReturnIdParams,
  ): ReturnType<SupplierReturnService['postSupplierReturn']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      supplier_return_id: params.supplier_return_id,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/supplier-returns/{supplier_return_id}/post',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.supplierReturnService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierReturnService['postSupplierReturn']>
      >;
    }

    try {
      const response = await this.supplierReturnService.postSupplierReturn(
        params.supplier_return_id,
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

  @Post(':supplier_return_id/cancel')
  async cancelSupplierReturn(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(supplierReturnIdParamsSchema))
    params: SupplierReturnIdParams,
    @Body(new ZodValidationPipe(cancelSupplierReturnRequestSchema))
    request: CancelSupplierReturnRequest,
  ): ReturnType<SupplierReturnService['cancelSupplierReturn']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      supplier_return_id: params.supplier_return_id,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/supplier-returns/{supplier_return_id}/cancel',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.supplierReturnService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierReturnService['cancelSupplierReturn']>
      >;
    }

    try {
      const response = await this.supplierReturnService.cancelSupplierReturn(
        params.supplier_return_id,
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
