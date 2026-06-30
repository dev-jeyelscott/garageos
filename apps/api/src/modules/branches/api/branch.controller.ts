import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import type { AuthService } from '../../auth/application/auth.service';
import type { BranchService } from '../application/branch.service';
import {
  type BranchStatusChangeRequest,
  branchStatusChangeRequestSchema,
  type CreateBranchRequest,
  createBranchRequestSchema,
  type UpdateBranchRequest,
  updateBranchRequestSchema,
} from './branch.schemas';

@Controller()
@UseGuards(AccessTokenAuthGuard)
export class BranchController {
  constructor(
    private readonly authService: AuthService,
    private readonly branchService: BranchService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('branches')
  async createBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createBranchRequestSchema))
    request: CreateBranchRequest,
  ): ReturnType<BranchService['createBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/branches',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.branchService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<BranchService['createBranch']>>;
    }

    try {
      const response = await this.branchService.createBranch(request, session.tenantContextSession);

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

  @Get('branches')
  async listBranches(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<BranchService['listBranches']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.branchService.listBranches(session.tenantContextSession);
  }

  @Get('branches/:branch_id')
  async getBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('branch_id') branchId: string,
  ): ReturnType<BranchService['getBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.branchService.getBranch(branchId, session.tenantContextSession);
  }

  @Patch('branches/:branch_id')
  async updateBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('branch_id') branchId: string,
    @Body(new ZodValidationPipe(updateBranchRequestSchema))
    request: UpdateBranchRequest,
  ): ReturnType<BranchService['updateBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.branchService.updateBranch(branchId, request, session.tenantContextSession);
  }

  @Post('branches/:branch_id/deactivate')
  @HttpCode(200)
  async deactivateBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('branch_id') branchId: string,
    @Body(new ZodValidationPipe(branchStatusChangeRequestSchema))
    request: BranchStatusChangeRequest,
  ): ReturnType<BranchService['deactivateBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const requestIntent = {
      branch_id: branchId,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/branches/{branch_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.branchService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<BranchService['deactivateBranch']>>;
    }

    try {
      const response = await this.branchService.deactivateBranch(
        branchId,
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

  @Post('branches/:branch_id/reactivate')
  @HttpCode(200)
  async reactivateBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('branch_id') branchId: string,
    @Body(new ZodValidationPipe(branchStatusChangeRequestSchema))
    request: BranchStatusChangeRequest,
  ): ReturnType<BranchService['reactivateBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const requestIntent = {
      branch_id: branchId,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/branches/{branch_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.branchService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<BranchService['reactivateBranch']>>;
    }

    try {
      const response = await this.branchService.reactivateBranch(
        branchId,
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
