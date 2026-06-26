import { Body, Controller, Get, Headers, Inject, Ip, Post, Res, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import {
  type AuthActionResult,
  type AuthLoginResult,
  type AuthRefreshResult,
  AuthService,
} from '../application/auth.service';
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
import { CurrentAuthSessionResponse } from './current-auth-session-response.decorator';
import { AccessTokenAuthGuard } from './access-token-auth.guard';

interface RefreshCookieResponse {
  cookie(name: string, value: string, options: RefreshTokenCookieOptions): void;
  clearCookie(name: string, options: RefreshTokenCookieOptions): void;
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
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthActionResult> {
    const refreshToken = this.authTokenTransportService.getRefreshTokenFromCookieHeader(
      cookieHeader ?? null,
    );

    const result = await this.authService.logout(refreshToken);
    this.clearRefreshTokenCookie(response);

    return result;
  }

  @Post('logout-all')
  async logoutAll(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthActionResult> {
    const refreshToken = this.authTokenTransportService.getRefreshTokenFromCookieHeader(
      cookieHeader ?? null,
    );

    const result = await this.authService.logoutAll(refreshToken);
    this.clearRefreshTokenCookie(response);

    return result;
  }

  @Post('email-verification/resend')
  async resendEmailVerification(
    @Headers('cookie') cookieHeader: string | undefined,
  ): Promise<AuthActionResult> {
    const refreshToken = this.authTokenTransportService.getRefreshTokenFromCookieHeader(
      cookieHeader ?? null,
    );

    return this.authService.resendEmailVerification(refreshToken);
  }

  @Post('email-verification/confirm')
  async confirmEmailVerification(
    @Body(new ZodValidationPipe(emailVerificationConfirmRequestSchema))
    request: EmailVerificationConfirmRequest,
  ): Promise<AuthActionResult> {
    return this.authService.confirmEmailVerification(request);
  }

  @Post('password/forgot')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema))
    request: ForgotPasswordRequest,
  ): Promise<AuthActionResult> {
    return this.authService.forgotPassword(request);
  }

  @Post('password/reset')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema))
    request: ResetPasswordRequest,
  ): Promise<AuthActionResult> {
    return this.authService.resetPassword(request);
  }

  @Post('password/change')
  async changePassword(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    request: ChangePasswordRequest,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthActionResult> {
    const refreshToken = this.authTokenTransportService.getRefreshTokenFromCookieHeader(
      cookieHeader ?? null,
    );

    const result = await this.authService.changePassword(request, refreshToken);
    this.clearRefreshTokenCookie(response);

    return result;
  }

  @Get('session')
  @UseGuards(AccessTokenAuthGuard)
  getSession(
    @CurrentAuthSessionResponse() session: AuthSessionResponseData,
  ): AuthSessionResponseData {
    return session;
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

  private clearRefreshTokenCookie(response: RefreshCookieResponse): void {
    response.clearCookie(
      this.authTokenTransportService.getRefreshTokenCookieName(),
      this.authTokenTransportService.buildClearRefreshTokenCookieOptions({
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
