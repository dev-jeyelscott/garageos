import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { MechanicSessionsService } from '../application/mechanic-sessions.service';
import {
  createMechanicSessionRequestSchema,
  type CreateMechanicSessionRequest,
  finishMechanicSessionRequestSchema,
  type FinishMechanicSessionRequest,
  listMechanicSessionsQuerySchema,
  type ListMechanicSessionsQuery,
} from './mechanic-session.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('mechanic-sessions')
export class MechanicSessionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly mechanicSessionsService: MechanicSessionsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listMechanicSessions(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listMechanicSessionsQuerySchema))
    query: ListMechanicSessionsQuery,
  ): ReturnType<MechanicSessionsService['listMechanicSessions']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.mechanicSessionsService.listMechanicSessions(query, session.tenantContextSession);
  }

  @Post()
  async startWorkSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createMechanicSessionRequestSchema))
    request: CreateMechanicSessionRequest,
  ): ReturnType<MechanicSessionsService['startWorkSession']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/mechanic-sessions',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.mechanicSessionsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<MechanicSessionsService['startWorkSession']>
      >;
    }

    try {
      const response = await this.mechanicSessionsService.startWorkSession(
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

  @Post(':session_id/pause')
  @HttpCode(200)
  async pauseWorkSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('session_id') sessionId: string,
  ): ReturnType<MechanicSessionsService['pauseWorkSession']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/mechanic-sessions/:session_id/pause',
      idempotencyKey,
      requestIntent: {
        session_id: sessionId,
      },
      now,
      expiresAt: this.mechanicSessionsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<MechanicSessionsService['pauseWorkSession']>
      >;
    }

    try {
      const response = await this.mechanicSessionsService.pauseWorkSession(
        sessionId,
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

  @Post(':session_id/resume')
  @HttpCode(200)
  async resumeWorkSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('session_id') sessionId: string,
  ): ReturnType<MechanicSessionsService['resumeWorkSession']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/mechanic-sessions/:session_id/resume',
      idempotencyKey,
      requestIntent: {
        session_id: sessionId,
      },
      now,
      expiresAt: this.mechanicSessionsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<MechanicSessionsService['resumeWorkSession']>
      >;
    }

    try {
      const response = await this.mechanicSessionsService.resumeWorkSession(
        sessionId,
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

  @Post(':session_id/finish')
  @HttpCode(200)
  async finishWorkSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('session_id') sessionId: string,
    @Body(new ZodValidationPipe(finishMechanicSessionRequestSchema))
    request: FinishMechanicSessionRequest,
  ): ReturnType<MechanicSessionsService['finishWorkSession']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/mechanic-sessions/:session_id/finish',
      idempotencyKey,
      requestIntent: {
        session_id: sessionId,
        ...request,
      },
      now,
      expiresAt: this.mechanicSessionsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<MechanicSessionsService['finishWorkSession']>
      >;
    }

    try {
      const response = await this.mechanicSessionsService.finishWorkSession(
        sessionId,
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
