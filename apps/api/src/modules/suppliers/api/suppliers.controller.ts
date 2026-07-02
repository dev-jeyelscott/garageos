import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { SupplierService } from '../application/supplier.service';
import {
  createSupplierRequestSchema,
  type CreateSupplierRequest,
  listSuppliersQuerySchema,
  type ListSuppliersQuery,
  supplierPaymentRequestSchema,
  type SupplierPaymentRequest,
  supplierStatusChangeRequestSchema,
  type SupplierStatusChangeRequest,
  updateSupplierRequestSchema,
  type UpdateSupplierRequest,
} from './supplier.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly authService: AuthService,
    private readonly supplierService: SupplierService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listSuppliers(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listSuppliersQuerySchema)) query: ListSuppliersQuery,
  ): ReturnType<SupplierService['listSuppliers']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierService.listSuppliers(query, session.tenantContextSession);
  }

  @Post()
  async createSupplier(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createSupplierRequestSchema)) request: CreateSupplierRequest,
  ): ReturnType<SupplierService['createSupplier']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/suppliers',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.supplierService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<SupplierService['createSupplier']>>;
    }

    try {
      const response = await this.supplierService.createSupplier(
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

  @Get(':supplier_id')
  async getSupplier(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('supplier_id') supplierId: string,
  ): ReturnType<SupplierService['getSupplier']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierService.getSupplier(supplierId, session.tenantContextSession);
  }

  @Post(':supplier_id/payments')
  async recordSupplierPayment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('supplier_id') supplierId: string,
    @Body(new ZodValidationPipe(supplierPaymentRequestSchema)) request: SupplierPaymentRequest,
  ): ReturnType<SupplierService['recordSupplierPayment']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      supplier_id: supplierId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/suppliers/{supplier_id}/payments',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.supplierService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierService['recordSupplierPayment']>
      >;
    }

    try {
      const response = await this.supplierService.recordSupplierPayment(
        supplierId,
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

  @Patch(':supplier_id')
  async updateSupplier(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('supplier_id') supplierId: string,
    @Body(new ZodValidationPipe(updateSupplierRequestSchema)) request: UpdateSupplierRequest,
  ): ReturnType<SupplierService['updateSupplier']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.supplierService.updateSupplier(supplierId, request, session.tenantContextSession);
  }

  @Post(':supplier_id/deactivate')
  @HttpCode(200)
  async deactivateSupplier(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('supplier_id') supplierId: string,
    @Body(new ZodValidationPipe(supplierStatusChangeRequestSchema))
    request: SupplierStatusChangeRequest,
  ): ReturnType<SupplierService['deactivateSupplier']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      supplier_id: supplierId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/suppliers/{supplier_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.supplierService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierService['deactivateSupplier']>
      >;
    }

    try {
      const response = await this.supplierService.deactivateSupplier(
        supplierId,
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

  @Post(':supplier_id/reactivate')
  @HttpCode(200)
  async reactivateSupplier(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('supplier_id') supplierId: string,
    @Body(new ZodValidationPipe(supplierStatusChangeRequestSchema))
    request: SupplierStatusChangeRequest,
  ): ReturnType<SupplierService['reactivateSupplier']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      supplier_id: supplierId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/suppliers/{supplier_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.supplierService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<SupplierService['reactivateSupplier']>
      >;
    }

    try {
      const response = await this.supplierService.reactivateSupplier(
        supplierId,
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
