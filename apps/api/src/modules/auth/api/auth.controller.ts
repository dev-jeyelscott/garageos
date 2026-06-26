import { Body, Controller, Get, Inject, Ip, Post } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
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
import type {
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
} from '../contracts';

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;

  constructor(@Inject(AuthService) authService: AuthService) {
    this.authService = authService;
  }

  @Post('signup-owner')
  signupOwner(): never {
    return this.authService.signupOwner();
  }

  @Post('login')
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
    @Ip() ipAddress: string | undefined,
  ): Promise<AuthLoginResponseData> {
    return this.authService.login(request, {
      ipAddress: ipAddress ?? null,
    });
  }

  @Post('refresh')
  refresh(): AuthRefreshResponseData {
    return this.authService.refresh();
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
}
