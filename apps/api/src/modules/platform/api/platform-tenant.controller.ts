import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { CurrentAuthSessionResponse } from '../../auth/api/current-auth-session-response.decorator';
import type { AuthSessionResponseData } from '../../auth/contracts';
import { PlatformTenantService } from '../application/platform-tenant.service';
import {
  type ApplyPlatformTenantReadOnlyOverrideRequest,
  applyPlatformTenantReadOnlyOverrideRequestSchema,
  type CreatePlatformTenantRequest,
  createPlatformTenantRequestSchema,
  type ListPlatformTenantsQuery,
  listPlatformTenantsQuerySchema,
  type UpdatePlatformTenantSubscriptionRequest,
  updatePlatformTenantSubscriptionRequestSchema,
} from './platform-tenant.schemas';

@Controller('platform')
@UseGuards(AccessTokenAuthGuard)
export class PlatformTenantController {
  constructor(
    @Inject(PlatformTenantService)
    private readonly platformTenantService: PlatformTenantService,
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get('tenants')
  listTenants(
    @Query(new ZodValidationPipe(listPlatformTenantsQuerySchema))
    query: ListPlatformTenantsQuery,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
  ): ReturnType<PlatformTenantService['listTenants']> {
    return this.platformTenantService.listTenants(query, session);
  }

  @Get('tenants/:tenantId')
  getTenant(
    @Param('tenantId') tenantId: string,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
  ): ReturnType<PlatformTenantService['getTenant']> {
    return this.platformTenantService.getTenant(tenantId, session);
  }

  @Post('tenants')
  @HttpCode(201)
  async createTenant(
    @Body(new ZodValidationPipe(createPlatformTenantRequestSchema))
    request: CreatePlatformTenantRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['createTenant']> {
    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['createTenant']>
      >;
    }

    try {
      const response = await this.platformTenantService.createTenant(request, session, {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

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

  @Post('tenants/:tenantId/subscription')
  @HttpCode(200)
  async updateTenantSubscription(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(updatePlatformTenantSubscriptionRequestSchema))
    request: UpdatePlatformTenantSubscriptionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['updateTenantSubscription']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/subscription',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['updateTenantSubscription']>
      >;
    }

    try {
      const response = await this.platformTenantService.updateTenantSubscription(
        tenantId,
        request,
        session,
        {
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
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

  @Post('tenants/:tenantId/read-only')
  @HttpCode(200)
  async applyTenantReadOnlyOverride(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(applyPlatformTenantReadOnlyOverrideRequestSchema))
    request: ApplyPlatformTenantReadOnlyOverrideRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['applyTenantReadOnlyOverride']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/read-only',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['applyTenantReadOnlyOverride']>
      >;
    }

    try {
      const response = await this.platformTenantService.applyTenantReadOnlyOverride(
        tenantId,
        request,
        session,
        {
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
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
