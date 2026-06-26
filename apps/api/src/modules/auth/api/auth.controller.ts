import { Body, Controller, Get, Headers, Inject, Ip, Post, Res } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AuthLoginResult, AuthRefreshResult, AuthService } from '../application/auth.service';
import {
  AuthTokenTransportService,
  type RefreshTokenCookieOptions,
} from '../application/auth-token-transport.service';
import type {
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
} from '../contracts';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type EmailVerificationConfirmRequest,
  emailVerificationConfirmRequestSchema,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
} from './auth.schemas';

interface RefreshCookieResponse {
  cookie(name: string, value: string, options: RefreshTokenCookieOptions): void;
}

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;

  constructor(
    @Inject(AuthService) authService: AuthService,
    @Inject(AuthTokenTransportService)
    private readonly authTokenTransportService: AuthTokenTransportService,
  ) {
    this.authService = authService;
  }

  @Post('signup-owner')
  signupOwner(): never {
    return this.authService.signupOwner();
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
    @Ip() ipAddress: string | undefined,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthLoginResponseData> {
    const result = await this.authService.login(request, {
      ipAddress: ipAddress ?? null,
    });

    this.setRefreshTokenCookie(response, result.refreshToken, result.rememberMe);

    return this.toLoginResponseData(result);
  }

  @Post('refresh')
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthRefreshResponseData> {
    const refreshToken = this.authTokenTransportService.getRefreshTokenFromCookieHeader(
      cookieHeader ?? null,
    );

    const result = await this.authService.refresh(refreshToken);

    this.setRefreshTokenCookie(response, result.refreshToken, result.rememberMe);

    return this.toRefreshResponseData(result);
  }

  @Post('logout')
  logout(): never {
    return this.authService.logout();
  }

  @Post('logout-all')
  logoutAll(): never {
    return this.authService.logoutAll();
  }

  @Post('email-verification/resend')
  resendEmailVerification(): never {
    return this.authService.resendEmailVerification();
  }

  @Post('email-verification/confirm')
  confirmEmailVerification(
    @Body(new ZodValidationPipe(emailVerificationConfirmRequestSchema))
    request: EmailVerificationConfirmRequest,
  ): never {
    return this.authService.confirmEmailVerification(request);
  }

  @Post('password/forgot')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema))
    request: ForgotPasswordRequest,
  ): never {
    return this.authService.forgotPassword(request);
  }

  @Post('password/reset')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema))
    request: ResetPasswordRequest,
  ): never {
    return this.authService.resetPassword(request);
  }

  @Post('password/change')
  changePassword(
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    request: ChangePasswordRequest,
  ): never {
    return this.authService.changePassword(request);
  }

  @Get('session')
  getSession(): AuthSessionResponseData {
    return this.authService.getSession();
  }

  private setRefreshTokenCookie(
    response: RefreshCookieResponse,
    refreshToken: string,
    rememberMe: boolean,
  ): void {
    response.cookie(
      this.authTokenTransportService.getRefreshTokenCookieName(),
      refreshToken,
      this.authTokenTransportService.buildRefreshTokenCookieOptions({
        rememberMe,
        secureCookies: process.env.AUTH_REFRESH_COOKIE_SECURE !== 'false',
      }),
    );
  }

  private toLoginResponseData(result: AuthLoginResult): AuthLoginResponseData {
    return {
      access_token: result.access_token,
      expires_in_seconds: result.expires_in_seconds,
      user: result.user,
      tenant: result.tenant,
      permissions: result.permissions,
      branches: result.branches,
      tenant_wide_branch_access: result.tenant_wide_branch_access,
    };
  }

  private toRefreshResponseData(result: AuthRefreshResult): AuthRefreshResponseData {
    return {
      access_token: result.access_token,
      expires_in_seconds: result.expires_in_seconds,
    };
  }
}
