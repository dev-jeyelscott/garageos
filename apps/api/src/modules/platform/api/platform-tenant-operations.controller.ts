import { Body, Controller, Headers, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { CurrentAuthSessionResponse } from '../../auth/api/current-auth-session-response.decorator';
import type { AuthSessionResponseData } from '../../auth/contracts';
import {
  type CreateSupportAccessSessionRequest,
  createSupportAccessSessionRequestSchema,
  type EndSupportAccessSessionRequest,
  endSupportAccessSessionRequestSchema,
  type TenantDeletionJobRequest,
  tenantDeletionJobRequestSchema,
  type TenantExportPlaceholderRequest,
  tenantExportPlaceholderRequestSchema,
  type TenantStatusOverrideRequest,
  tenantStatusOverrideRequestSchema,
} from './platform-tenant-operations.schemas';
import { PlatformTenantOperationsService } from '../application/platform-tenant-operations.service';

@Controller('platform')
@UseGuards(AccessTokenAuthGuard)
export class PlatformTenantOperationsController {
  constructor(private readonly service: PlatformTenantOperationsService) {}

  @Post('tenants/:tenantId/support-access-sessions')
  @HttpCode(201)
  createSupportAccessSession(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(createSupportAccessSessionRequestSchema))
    request: CreateSupportAccessSessionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.createSupportAccessSession(tenantId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('support-access-sessions/:supportAccessSessionId/end')
  endSupportAccessSession(
    @Param('supportAccessSessionId') supportAccessSessionId: string,
    @Body(new ZodValidationPipe(endSupportAccessSessionRequestSchema))
    request: EndSupportAccessSessionRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.endSupportAccessSession(supportAccessSessionId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('tenants/:tenantId/read-only')
  applyReadOnlyOverride(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(tenantStatusOverrideRequestSchema))
    request: TenantStatusOverrideRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.applyReadOnlyOverride(tenantId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('tenants/:tenantId/suspend')
  suspendTenant(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(tenantStatusOverrideRequestSchema))
    request: TenantStatusOverrideRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.suspendTenant(tenantId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('tenants/:tenantId/exports')
  @HttpCode(202)
  queueTenantExportPlaceholder(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(tenantExportPlaceholderRequestSchema))
    request: TenantExportPlaceholderRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.queueTenantExportPlaceholder(tenantId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('tenants/:tenantId/deletion-jobs')
  @HttpCode(202)
  queueTenantDeletionJob(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(tenantDeletionJobRequestSchema))
    request: TenantDeletionJobRequest,
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.service.queueTenantDeletionJob(tenantId, request, session, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }
}
