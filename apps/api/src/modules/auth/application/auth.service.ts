import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  ChangePasswordRequest,
  EmailVerificationConfirmRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '../api/auth.schemas';
import {
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
  AuthUserSummary,
} from '../contracts';
import { AUTH_RATE_LIMIT_RULES, normalizeAuthRateLimitEmailKey } from './auth-rate-limit.policy';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthLoginContext, AuthUserStore } from './auth-user.store';
import { PasswordHashingService } from './password-hashing.service';
import { AccessTokenService } from '../security/access-token.service';

export interface AuthLoginRequestContext {
  readonly ipAddress?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthUserStore)
    private readonly authUserStore: AuthUserStore,
    @Inject(PasswordHashingService)
    private readonly passwordHashingService: PasswordHashingService,
    @Inject(AccessTokenService)
    private readonly accessTokenService: AccessTokenService,
    @Inject(AuthRateLimitService)
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  signupOwner(): never {
    return this.authUnavailable();
  }

  async login(
    request: LoginRequest,
    context: AuthLoginRequestContext = {},
  ): Promise<AuthLoginResponseData> {
    const normalizedEmail = normalizeAuthRateLimitEmailKey(request.email);
    const ipAddress = context.ipAddress ?? null;

    await this.assertLoginRateLimitAllowed(normalizedEmail, ipAddress);

    const loginContext = await this.authUserStore.findActiveLoginContextByNormalizedEmail({
      normalizedEmail,
    });

    if (loginContext === null) {
      await this.recordFailedLoginAttempt({
        normalizedEmail,
        ipAddress,
        tenantId: null,
        userId: null,
      });

      throw this.invalidCredentials();
    }

    const passwordMatches = await this.verifyPasswordSafely(
      request.password,
      loginContext.user.passwordHash,
    );

    if (!passwordMatches) {
      await this.recordFailedLoginAttempt({
        normalizedEmail,
        ipAddress,
        tenantId: loginContext.user.tenantId,
        userId: loginContext.user.id,
      });

      throw this.invalidCredentials();
    }

    const signedAccessToken = await this.accessTokenService.sign({
      user_id: loginContext.user.id,
      user_type: loginContext.user.userType,
      tenant_id: loginContext.user.tenantId,
      session_id: randomUUID(),
      email_verified: loginContext.user.emailVerifiedAt !== null,
    });

    return {
      access_token: signedAccessToken.access_token,
      expires_in_seconds: signedAccessToken.expires_in_seconds,
      user: this.toUserSummary(loginContext),
      tenant: loginContext.tenant,
      permissions: loginContext.permissions,
      branches: loginContext.branches,
      tenant_wide_branch_access: loginContext.tenantWideBranchAccess,
    };
  }

  refresh(): AuthRefreshResponseData {
    throw GarageOsApiException.serviceUnavailable('Authentication is not available yet.');
  }

  logout(): never {
    return this.authUnavailable();
  }

  logoutAll(): never {
    return this.authUnavailable();
  }

  resendEmailVerification(): never {
    return this.authUnavailable();
  }

  confirmEmailVerification(request: EmailVerificationConfirmRequest): never {
    void request;

    return this.authUnavailable();
  }

  forgotPassword(request: ForgotPasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  resetPassword(request: ResetPasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  changePassword(request: ChangePasswordRequest): never {
    void request;

    return this.authUnavailable();
  }

  getSession(): AuthSessionResponseData {
    throw GarageOsApiException.serviceUnavailable('Authentication is not available yet.');
  }

  private async assertLoginRateLimitAllowed(
    normalizedEmail: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.authRateLimitService.assertAllowed({
      rule: AUTH_RATE_LIMIT_RULES.LOGIN,
      keyParts: ['account', normalizedEmail],
    });

    if (ipAddress !== null && ipAddress.trim().length > 0) {
      await this.authRateLimitService.assertAllowed({
        rule: AUTH_RATE_LIMIT_RULES.LOGIN,
        keyParts: ['ip', ipAddress],
      });
    }
  }

  private async recordFailedLoginAttempt(input: {
    readonly normalizedEmail: string;
    readonly ipAddress: string | null;
    readonly tenantId: string | null;
    readonly userId: string | null;
  }): Promise<void> {
    await this.authRateLimitService.recordAttempt({
      rule: AUTH_RATE_LIMIT_RULES.LOGIN,
      keyParts: ['account', input.normalizedEmail],
      tenantId: input.tenantId,
      userId: input.userId,
      ipAddress: input.ipAddress,
    });

    if (input.ipAddress !== null && input.ipAddress.trim().length > 0) {
      await this.authRateLimitService.recordAttempt({
        rule: AUTH_RATE_LIMIT_RULES.LOGIN,
        keyParts: ['ip', input.ipAddress],
        tenantId: input.tenantId,
        userId: input.userId,
        ipAddress: input.ipAddress,
      });
    }
  }

  private async verifyPasswordSafely(password: string, passwordHash: string): Promise<boolean> {
    try {
      return await this.passwordHashingService.verifyPassword(password, passwordHash);
    } catch {
      return false;
    }
  }

  private toUserSummary(loginContext: AuthLoginContext): AuthUserSummary {
    return {
      id: loginContext.user.id,
      user_type: loginContext.user.userType,
      full_name: loginContext.user.fullName,
      email: loginContext.user.email,
      email_verified: loginContext.user.emailVerifiedAt !== null,
      status: loginContext.user.status,
    };
  }

  private invalidCredentials(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Invalid email or password.');
  }

  private authUnavailable(): never {
    throw GarageOsApiException.serviceUnavailable(
      'Authentication routes are available, but authentication is not implemented yet.',
    );
  }
}
