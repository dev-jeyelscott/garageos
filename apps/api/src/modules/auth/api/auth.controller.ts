import { Body, Controller, Get, Headers, Inject, Ip, Post, Res, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  AUDIT_ACTOR_TYPES,
  AuditService,
  type AuditActorType,
} from '../../../shared/audit/audit.service';
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
  AuthUserType,
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
  type OwnerSignupRequest,
  ownerSignupRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
} from './auth.schemas';
import { OwnerSignupService, type OwnerSignupResponse } from '../application/owner-signup.service';
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
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(OwnerSignupService)
    private readonly ownerSignupService: OwnerSignupService,
  ) {
    this.authService = authService;
  }

  @Post('signup-owner')
  async signupOwner(
    @Body(new ZodValidationPipe(ownerSignupRequestSchema))
    request: OwnerSignupRequest,
  ): Promise<OwnerSignupResponse> {
    return this.ownerSignupService.signupOwner(request);
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
    @Ip() ipAddress: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: RefreshCookieResponse,
  ): Promise<AuthLoginResponseData> {
    try {
      const result = await this.authService.login(request, {
        ipAddress: ipAddress ?? null,
      });

      await this.auditLoginSucceeded({
        result,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      this.setRefreshTokenCookie(response, result.refreshToken, result.rememberMe);

      return this.toLoginResponseData(result);
    } catch (error) {
      await this.auditLoginFailed({
        loginIdentifier: request.email,
        error,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      throw error;
    }
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

  private async auditLoginSucceeded(input: {
    readonly result: AuthLoginResult;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
  }): Promise<void> {
    await this.auditService.record({
      tenantId: input.result.tenant?.id ?? null,
      actorUserId: input.result.user.id,
      actorType: this.toAuditActorType(input.result.user.user_type),
      action: 'auth.login.succeeded',
      entityType: 'user',
      entityId: input.result.user.id,
      metadataJson: {
        remember_me: input.result.rememberMe,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  private async auditLoginFailed(input: {
    readonly loginIdentifier: string;
    readonly error: unknown;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
  }): Promise<void> {
    const errorCode = this.getErrorCode(input.error);

    await this.auditService.record({
      actorType: AUDIT_ACTOR_TYPES.SYSTEM,
      action: errorCode === 'rate_limited' ? 'auth.login.locked' : 'auth.login.failed',
      entityType: 'auth_login_attempt',
      metadataJson: {
        login_identifier_hash: hashAuditIdentifier(input.loginIdentifier),
        error_code: errorCode,
      },
      reason: errorCode === 'rate_limited' ? 'login_rate_limit_exceeded' : 'invalid_credentials',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  private getErrorCode(error: unknown): string {
    if (error instanceof GarageOsApiException) {
      return error.code;
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { readonly code?: unknown }).code;

      if (typeof code === 'string' && code.length > 0) {
        return code;
      }
    }

    return 'unexpected_error';
  }

  private toAuditActorType(userType: AuthUserType): AuditActorType {
    return userType === 'platform_admin'
      ? AUDIT_ACTOR_TYPES.PLATFORM_ADMIN
      : AUDIT_ACTOR_TYPES.TENANT_USER;
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

function hashAuditIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase(), 'utf8').digest('hex');
}
