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
  type ApplyPlatformTenantSuspensionRequest,
  applyPlatformTenantSuspensionRequestSchema,
  type CreatePlatformTenantRequest,
  createPlatformTenantRequestSchema,
  type ListPlatformTenantsQuery,
  listPlatformTenantsQuerySchema,
  type QueuePlatformTenantExportRequest,
  queuePlatformTenantExportRequestSchema,
  type StartPlatformSupportAccessSessionRequest,
  startPlatformSupportAccessSessionRequestSchema,
  type UpdatePlatformTenantSubscriptionRequest,
  updatePlatformTenantSubscriptionRequestSchema,
  type QueuePlatformTenantDeletionJobRequest,
  queuePlatformTenantDeletionJobRequestSchema,
  type EndPlatformSupportAccessSessionRequest,
  endPlatformSupportAccessSessionRequestSchema,
  type ListPlatformAuditLogsQuery,
  listPlatformAuditLogsQuerySchema,
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

  @Get('audit-logs')
  listAuditLogs(
    @Query(new ZodValidationPipe(listPlatformAuditLogsQuerySchema))
    query: ListPlatformAuditLogsQuery,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
  ): ReturnType<PlatformTenantService['listAuditLogs']> {
    return this.platformTenantService.listAuditLogs(query, session);
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

  @Post('tenants/:tenantId/suspend')
  @HttpCode(200)
  async applyTenantSuspension(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(applyPlatformTenantSuspensionRequestSchema))
    request: ApplyPlatformTenantSuspensionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['applyTenantSuspension']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/suspend',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['applyTenantSuspension']>
      >;
    }

    try {
      const response = await this.platformTenantService.applyTenantSuspension(
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

  @Post('tenants/:tenantId/exports')
  @HttpCode(202)
  async queueTenantExport(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(queuePlatformTenantExportRequestSchema))
    request: QueuePlatformTenantExportRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['queueTenantExport']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/exports',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['queueTenantExport']>
      >;
    }

    try {
      const response = await this.platformTenantService.queueTenantExport(
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
        responseStatusCode: 202,
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

  @Post('tenants/:tenantId/deletion-jobs')
  @HttpCode(202)
  async queueTenantDeletionJob(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(queuePlatformTenantDeletionJobRequestSchema))
    request: QueuePlatformTenantDeletionJobRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['queueTenantDeletionJob']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/deletion-jobs',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['queueTenantDeletionJob']>
      >;
    }

    try {
      const response = await this.platformTenantService.queueTenantDeletionJob(
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
        responseStatusCode: 202,
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

  @Post('tenants/:tenantId/support-access-sessions')
  @HttpCode(201)
  async startSupportAccessSession(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(startPlatformSupportAccessSessionRequestSchema))
    request: StartPlatformSupportAccessSessionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['startSupportAccessSession']> {
    const now = new Date();
    const requestIntent = {
      tenant_id: tenantId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/tenants/{tenant_id}/support-access-sessions',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['startSupportAccessSession']>
      >;
    }

    try {
      const response = await this.platformTenantService.startSupportAccessSession(
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

  @Post('support-access-sessions/:supportAccessSessionId/end')
  @HttpCode(200)
  async endSupportAccessSession(
    @Param('supportAccessSessionId') supportAccessSessionId: string,
    @Body(new ZodValidationPipe(endPlatformSupportAccessSessionRequestSchema))
    request: EndPlatformSupportAccessSessionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ): ReturnType<PlatformTenantService['endSupportAccessSession']> {
    const now = new Date();
    const requestIntent = {
      support_access_session_id: supportAccessSessionId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: null,
      userId: session.user.id,
      endpoint: 'POST /api/v1/platform/support-access-sessions/{id}/end',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.platformTenantService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<PlatformTenantService['endSupportAccessSession']>
      >;
    }

    try {
      const response = await this.platformTenantService.endSupportAccessSession(
        supportAccessSessionId,
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
