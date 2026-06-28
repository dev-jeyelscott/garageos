import {
  Body,
  Controller,
  Delete,
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
import { JobOrdersService } from '../application/job-orders.service';
import {
  appendJobOrderServiceNoteRequestSchema,
  type AppendJobOrderServiceNoteRequest,
  assignJobOrderMechanicsRequestSchema,
  createJobOrderAttachmentPlaceholderRequestSchema,
  type CreateJobOrderAttachmentPlaceholderRequest,
  type AssignJobOrderMechanicsRequest,
  completeJobOrderLineRequestSchema,
  type CompleteJobOrderLineRequest,
  createJobOrderPartLineRequestSchema,
  type CreateJobOrderPartLineRequest,
  createJobOrderRequestSchema,
  type CreateJobOrderRequest,
  createJobOrderServiceLineRequestSchema,
  type CreateJobOrderServiceLineRequest,
  listJobOrdersQuerySchema,
  type ListJobOrdersQuery,
  transitionJobOrderStatusRequestSchema,
  type TransitionJobOrderStatusRequest,
  updateJobOrderLineRequestSchema,
  type UpdateJobOrderLineRequest,
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

  @Get(':job_order_id/status-events')
  async listStatusEvents(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
  ): ReturnType<JobOrdersService['listStatusEvents']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.listStatusEvents(jobOrderId, session.tenantContextSession);
  }

  @Get(':job_order_id/audit-events')
  async listAuditEvents(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
  ): ReturnType<JobOrdersService['listAuditEvents']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.listAuditEvents(jobOrderId, session.tenantContextSession);
  }

  @Get(':job_order_id/attachments')
  async listAttachmentPlaceholders(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
  ): ReturnType<JobOrdersService['listAttachmentPlaceholders']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.listAttachmentPlaceholders(
      jobOrderId,
      session.tenantContextSession,
    );
  }

  @Post(':job_order_id/attachments')
  async createAttachmentPlaceholder(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(createJobOrderAttachmentPlaceholderRequestSchema))
    request: CreateJobOrderAttachmentPlaceholderRequest,
  ): ReturnType<JobOrdersService['createAttachmentPlaceholder']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/attachments',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['createAttachmentPlaceholder']>
      >;
    }

    try {
      const response = await this.jobOrdersService.createAttachmentPlaceholder(
        jobOrderId,
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

  @Post(':job_order_id/assign-mechanics')
  async assignMechanics(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(assignJobOrderMechanicsRequestSchema))
    request: AssignJobOrderMechanicsRequest,
  ): ReturnType<JobOrdersService['assignMechanics']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.assignMechanics(jobOrderId, request, session.tenantContextSession);
  }

  @Post(':job_order_id/service-notes')
  @HttpCode(200)
  async appendServiceNote(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(appendJobOrderServiceNoteRequestSchema))
    request: AppendJobOrderServiceNoteRequest,
  ): ReturnType<JobOrdersService['appendServiceNote']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/service-notes',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['appendServiceNote']>
      >;
    }

    try {
      const response = await this.jobOrdersService.appendServiceNote(
        jobOrderId,
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

  @Post(':job_order_id/status-transitions')
  async transitionStatus(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(transitionJobOrderStatusRequestSchema))
    request: TransitionJobOrderStatusRequest,
  ): ReturnType<JobOrdersService['transitionStatus']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/status-transitions',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['transitionStatus']>
      >;
    }

    try {
      const response = await this.jobOrdersService.transitionStatus(
        jobOrderId,
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

  @Post(':job_order_id/service-lines')
  async addServiceLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(createJobOrderServiceLineRequestSchema))
    request: CreateJobOrderServiceLineRequest,
  ): ReturnType<JobOrdersService['addServiceLine']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/service-lines',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['addServiceLine']>
      >;
    }

    try {
      const response = await this.jobOrdersService.addServiceLine(
        jobOrderId,
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

  @Patch(':job_order_id/lines/:line_id')
  async updateJobOrderLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Param('line_id') lineId: string,
    @Body(new ZodValidationPipe(updateJobOrderLineRequestSchema))
    request: UpdateJobOrderLineRequest,
  ): ReturnType<JobOrdersService['updateJobOrderLine']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.jobOrdersService.updateJobOrderLine(
      jobOrderId,
      lineId,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':job_order_id/lines/:line_id/complete')
  @HttpCode(200)
  async completeJobOrderLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Param('line_id') lineId: string,
    @Body(new ZodValidationPipe(completeJobOrderLineRequestSchema))
    request: CompleteJobOrderLineRequest,
  ): ReturnType<JobOrdersService['completeJobOrderLine']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/lines/:line_id/complete',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        line_id: lineId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['completeJobOrderLine']>
      >;
    }

    try {
      const response = await this.jobOrdersService.completeJobOrderLine(
        jobOrderId,
        lineId,
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

  @Delete(':job_order_id/lines/:line_id')
  async removeJobOrderLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Param('line_id') lineId: string,
  ): ReturnType<JobOrdersService['removeJobOrderLine']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'DELETE /api/v1/job-orders/:job_order_id/lines/:line_id',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        line_id: lineId,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['removeJobOrderLine']>
      >;
    }

    try {
      const response = await this.jobOrdersService.removeJobOrderLine(
        jobOrderId,
        lineId,
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

  @Post(':job_order_id/part-lines')
  async createPartLine(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('job_order_id') jobOrderId: string,
    @Body(new ZodValidationPipe(createJobOrderPartLineRequestSchema))
    request: CreateJobOrderPartLineRequest,
  ): ReturnType<JobOrdersService['createPartLine']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/job-orders/:job_order_id/part-lines',
      idempotencyKey,
      requestIntent: {
        job_order_id: jobOrderId,
        ...request,
      },
      now,
      expiresAt: this.jobOrdersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<JobOrdersService['createPartLine']>
      >;
    }

    try {
      const response = await this.jobOrdersService.createPartLine(
        jobOrderId,
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
