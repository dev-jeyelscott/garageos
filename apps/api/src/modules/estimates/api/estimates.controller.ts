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
import { EstimatesService } from '../application/estimates.service';
import {
  approveEstimateRequestSchema,
  type ApproveEstimateRequest,
  convertEstimateRequestSchema,
  type ConvertEstimateRequest,
  createEstimateRequestSchema,
  type CreateEstimateRequest,
  listEstimatesQuerySchema,
  type ListEstimatesQuery,
  presentEstimateRequestSchema,
  type PresentEstimateRequest,
  updateEstimateRequestSchema,
  type UpdateEstimateRequest,
} from './estimate.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('estimates')
export class EstimatesController {
  constructor(
    private readonly authService: AuthService,
    private readonly estimatesService: EstimatesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listEstimates(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listEstimatesQuerySchema))
    query: ListEstimatesQuery,
  ): ReturnType<EstimatesService['listEstimates']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.estimatesService.listEstimates(query, session.tenantContextSession);
  }

  @Post()
  async createEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createEstimateRequestSchema))
    request: CreateEstimateRequest,
  ): ReturnType<EstimatesService['createEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/estimates',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.estimatesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EstimatesService['createEstimate']>
      >;
    }

    try {
      const response = await this.estimatesService.createEstimate(
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

  @Get(':estimate_id')
  async getEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimate_id') estimateId: string,
  ): ReturnType<EstimatesService['getEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.estimatesService.getEstimate(estimateId, session.tenantContextSession);
  }

  @Patch(':estimate_id')
  async updateEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('estimate_id') estimateId: string,
    @Body(new ZodValidationPipe(updateEstimateRequestSchema))
    request: UpdateEstimateRequest,
  ): ReturnType<EstimatesService['updateEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.estimatesService.updateEstimate(estimateId, request, session.tenantContextSession);
  }

  @Post(':estimate_id/present')
  @HttpCode(200)
  async presentEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('estimate_id') estimateId: string,
    @Body(new ZodValidationPipe(presentEstimateRequestSchema))
    request: PresentEstimateRequest,
  ): ReturnType<EstimatesService['presentEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/estimates/:estimate_id/present',
      idempotencyKey,
      requestIntent: {
        estimate_id: estimateId,
        ...request,
      },
      now,
      expiresAt: this.estimatesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EstimatesService['presentEstimate']>
      >;
    }

    try {
      const response = await this.estimatesService.presentEstimate(
        estimateId,
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

  @Post(':estimate_id/approve')
  @HttpCode(200)
  async approveEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('estimate_id') estimateId: string,
    @Body(new ZodValidationPipe(approveEstimateRequestSchema))
    request: ApproveEstimateRequest,
  ): ReturnType<EstimatesService['approveEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/estimates/:estimate_id/approve',
      idempotencyKey,
      requestIntent: {
        estimate_id: estimateId,
        ...request,
      },
      now,
      expiresAt: this.estimatesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EstimatesService['approveEstimate']>
      >;
    }

    try {
      const response = await this.estimatesService.approveEstimate(
        estimateId,
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

  @Post(':estimate_id/convert')
  @HttpCode(200)
  async convertEstimate(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('estimate_id') estimateId: string,
    @Body(new ZodValidationPipe(convertEstimateRequestSchema))
    request: ConvertEstimateRequest,
  ): ReturnType<EstimatesService['convertEstimate']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/estimates/:estimate_id/convert',
      idempotencyKey,
      requestIntent: {
        estimate_id: estimateId,
        ...request,
      },
      now,
      expiresAt: this.estimatesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EstimatesService['convertEstimate']>
      >;
    }

    try {
      const response = await this.estimatesService.convertEstimate(
        estimateId,
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
