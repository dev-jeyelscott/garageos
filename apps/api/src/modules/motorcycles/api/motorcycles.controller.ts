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
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import type { AuthService } from '../../auth/application/auth.service';
import type { MotorcyclesService } from '../application/motorcycles.service';
import {
  createMotorcycleRequestSchema,
  type CreateMotorcycleRequest,
  listMotorcyclesQuerySchema,
  type ListMotorcyclesQuery,
  updateMotorcycleRequestSchema,
  type UpdateMotorcycleRequest,
} from './motorcycle.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('motorcycles')
export class MotorcyclesController {
  constructor(
    private readonly authService: AuthService,
    private readonly motorcyclesService: MotorcyclesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listMotorcycles(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listMotorcyclesQuerySchema))
    query: ListMotorcyclesQuery,
  ): ReturnType<MotorcyclesService['listMotorcycles']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.motorcyclesService.listMotorcycles(query, session.tenantContextSession);
  }

  @Post()
  async createMotorcycle(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createMotorcycleRequestSchema))
    request: CreateMotorcycleRequest,
  ): ReturnType<MotorcyclesService['createMotorcycle']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/motorcycles',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.motorcyclesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<MotorcyclesService['createMotorcycle']>
      >;
    }

    try {
      const response = await this.motorcyclesService.createMotorcycle(
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

  @Get(':motorcycle_id')
  async getMotorcycle(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('motorcycle_id') motorcycleId: string,
  ): ReturnType<MotorcyclesService['getMotorcycle']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.motorcyclesService.getMotorcycle(motorcycleId, session.tenantContextSession);
  }

  @Patch(':motorcycle_id')
  async updateMotorcycle(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('motorcycle_id') motorcycleId: string,
    @Body(new ZodValidationPipe(updateMotorcycleRequestSchema))
    request: UpdateMotorcycleRequest,
  ): ReturnType<MotorcyclesService['updateMotorcycle']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.motorcyclesService.updateMotorcycle(
      motorcycleId,
      request,
      session.tenantContextSession,
    );
  }
}
