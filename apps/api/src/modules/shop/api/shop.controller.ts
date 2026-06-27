import { Body, Controller, Get, Headers, Post, Put, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import {
  type CreateBranchRequest,
  createBranchRequestSchema,
  type RenewalRequest,
  renewalRequestSchema,
  type ShopProfileRequest,
  shopProfileRequestSchema,
} from './shop.schemas';
import { ShopService } from '../application/shop.service';

@Controller()
@UseGuards(AccessTokenAuthGuard)
export class ShopController {
  constructor(
    private readonly authService: AuthService,
    private readonly shopService: ShopService,
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
    @Body(new ZodValidationPipe(createBranchRequestSchema))
    request: CreateBranchRequest,
  ): ReturnType<ShopService['createBranch']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.shopService.createBranch(request, session.tenantContextSession);
  }
}
