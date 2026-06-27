import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import {
  type CreateBranchRequest,
  createBranchRequestSchema,
  type BranchStatusChangeRequest,
  branchStatusChangeRequestSchema,
  type RenewalRequest,
  renewalRequestSchema,
  type ShopProfileRequest,
  shopProfileRequestSchema,
  type UpdateBranchRequest,
  updateBranchRequestSchema,
} from './shop.schemas';
import { ShopService } from '../application/shop.service';

@Controller()
@UseGuards(AccessTokenAuthGuard)
export class ShopController {
  constructor(
    private readonly authService: AuthService,
    private readonly shopService: ShopService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get('shop/onboarding-state')
  async getOnboardingState(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<ShopService['getOnboardingState']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.getOnboardingState(session.tenantContextSession);
  }

  @Put('shop/profile')
  async upsertProfile(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body(new ZodValidationPipe(shopProfileRequestSchema))
    request: ShopProfileRequest,
  ): ReturnType<ShopService['upsertProfile']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.upsertProfile(request, session.tenantContextSession);
  }

  @Post('shop/complete-onboarding')
  async completeOnboarding(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<ShopService['completeOnboarding']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.completeOnboarding(session.tenantContextSession);
  }

  @Post('shop/renewal-request')
  async requestRenewal(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body(new ZodValidationPipe(renewalRequestSchema))
    request: RenewalRequest,
  ): ReturnType<ShopService['requestRenewal']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.requestRenewal(request, session.tenantContextSession);
  }

  @Post('branches')
  async createBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createBranchRequestSchema))
    request: CreateBranchRequest,
  ): ReturnType<ShopService['createBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/branches',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.shopService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<ShopService['createBranch']>>;
    }

    try {
      const response = await this.shopService.createBranch(request, session.tenantContextSession);

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
  ): ReturnType<ShopService['listBranches']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.listBranches(session.tenantContextSession);
  }

  @Get('branches/:branch_id')
  async getBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('branch_id') branchId: string,
  ): ReturnType<ShopService['getBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.getBranch(branchId, session.tenantContextSession);
  }

  @Patch('branches/:branch_id')
  async updateBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('branch_id') branchId: string,
    @Body(new ZodValidationPipe(updateBranchRequestSchema))
    request: UpdateBranchRequest,
  ): ReturnType<ShopService['updateBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.updateBranch(branchId, request, session.tenantContextSession);
  }

  @Post('branches/:branch_id/deactivate')
  @HttpCode(200)
  async deactivateBranch(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('branch_id') branchId: string,
    @Body(new ZodValidationPipe(branchStatusChangeRequestSchema))
    request: BranchStatusChangeRequest,
  ): ReturnType<ShopService['deactivateBranch']> {
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
      expiresAt: this.shopService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ShopService['deactivateBranch']>
      >;
    }

    try {
      const response = await this.shopService.deactivateBranch(
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
  ): ReturnType<ShopService['reactivateBranch']> {
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
      expiresAt: this.shopService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ShopService['reactivateBranch']>
      >;
    }

    try {
      const response = await this.shopService.reactivateBranch(
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
