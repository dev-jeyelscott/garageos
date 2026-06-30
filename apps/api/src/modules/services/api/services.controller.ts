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
import type { ServicesService } from '../application/services.service';
import {
  createServiceRequestSchema,
  type CreateServiceRequest,
  listServicesQuerySchema,
  type ListServicesQuery,
  serviceStatusChangeRequestSchema,
  type ServiceStatusChangeRequest,
  updateServiceRequestSchema,
  type UpdateServiceRequest,
} from './service.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(
    private readonly authService: AuthService,
    private readonly servicesService: ServicesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listServices(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listServicesQuerySchema))
    query: ListServicesQuery,
  ): ReturnType<ServicesService['listServices']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.servicesService.listServices(query, session.tenantContextSession);
  }

  @Post()
  async createService(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createServiceRequestSchema))
    request: CreateServiceRequest,
  ): ReturnType<ServicesService['createService']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/services',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.servicesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<ServicesService['createService']>>;
    }

    try {
      const response = await this.servicesService.createService(
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

  @Get(':service_id')
  async getService(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('service_id') serviceId: string,
  ): ReturnType<ServicesService['getService']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.servicesService.getService(serviceId, session.tenantContextSession);
  }

  @Patch(':service_id')
  async updateService(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('service_id') serviceId: string,
    @Body(new ZodValidationPipe(updateServiceRequestSchema))
    request: UpdateServiceRequest,
  ): ReturnType<ServicesService['updateService']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.servicesService.updateService(serviceId, request, session.tenantContextSession);
  }

  @Post(':service_id/deactivate')
  @HttpCode(200)
  async deactivateService(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('service_id') serviceId: string,
    @Body(new ZodValidationPipe(serviceStatusChangeRequestSchema))
    request: ServiceStatusChangeRequest,
  ): ReturnType<ServicesService['deactivateService']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      service_id: serviceId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/services/{service_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.servicesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ServicesService['deactivateService']>
      >;
    }

    try {
      const response = await this.servicesService.deactivateService(
        serviceId,
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

  @Post(':service_id/reactivate')
  @HttpCode(200)
  async reactivateService(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('service_id') serviceId: string,
    @Body(new ZodValidationPipe(serviceStatusChangeRequestSchema))
    request: ServiceStatusChangeRequest,
  ): ReturnType<ServicesService['reactivateService']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      service_id: serviceId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/services/{service_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.servicesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ServicesService['reactivateService']>
      >;
    }

    try {
      const response = await this.servicesService.reactivateService(
        serviceId,
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
