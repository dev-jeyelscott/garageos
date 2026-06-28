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
import { JobOrdersService } from '../application/job-orders.service';
import {
  createJobOrderRequestSchema,
  type CreateJobOrderRequest,
  listJobOrdersQuerySchema,
  type ListJobOrdersQuery,
  updateJobOrderRequestSchema,
  type UpdateJobOrderRequest,
} from './job-order.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('job-orders')
export class JobOrdersController {
  constructor(
    private readonly authService: AuthService,
    private readonly jobOrdersService: JobOrdersService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listJobOrders(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listJobOrdersQuerySchema))
    query: ListJobOrdersQuery,
  ): ReturnType<JobOrdersService['listJobOrders']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.listJobOrders(query, session.tenantContextSession);
  }

  @Post()
  async createJobOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createJobOrderRequestSchema))
    request: CreateJobOrderRequest,
  ): ReturnType<JobOrdersService['createJobOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['createJobOrder']>
      >;
    }

    try {
      const response = await this.jobOrdersService.createJobOrder(
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

  @Get(':job_order_id')
  async getJobOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
  ): ReturnType<JobOrdersService['getJobOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.getJobOrder(jobOrderId, session.tenantContextSession);
  }

  @Patch(':job_order_id')
  async updateJobOrder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(updateJobOrderRequestSchema))
    request: UpdateJobOrderRequest,
  ): ReturnType<JobOrdersService['updateJobOrder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.updateJobOrder(jobOrderId, request, session.tenantContextSession);
  }
}
