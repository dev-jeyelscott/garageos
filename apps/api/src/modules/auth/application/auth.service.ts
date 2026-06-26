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
  AuthAccessTokenPayload,
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionAccessSummary,
  AuthSessionResponseData,
  AuthUserSummary,
} from '../contracts';
import { AUTH_RATE_LIMIT_RULES, normalizeAuthRateLimitEmailKey } from './auth-rate-limit.policy';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthLoginContext, AuthUserStore } from './auth-user.store';
import { PasswordHashingService } from './password-hashing.service';
import { AccessTokenService } from '../security/access-token.service';
import { AUTH_SECURITY } from './auth-security.constants';
import { AuthSessionService } from './auth-session.service';
import { SecureTokenService } from './secure-token.service';
import { TokenHashingService } from './token-hashing.service';
import { AUTH_SESSION_POLICY } from './auth-session.policy';
import type { RefreshSessionRecord } from './refresh-session.store';
import { PasswordResetTokenStore } from './password-reset-token.store';
import { EmailVerificationTokenStore } from './email-verification-token.store';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';

export interface AuthLoginRequestContext {
  readonly ipAddress?: string | null;
}

export interface AuthLoginResult extends AuthLoginResponseData {
  readonly refreshToken: string;
  readonly refreshSessionId: string;
  readonly rememberMe: boolean;
}

export interface AuthRefreshResult extends AuthRefreshResponseData {
  readonly refreshToken: string;
  readonly refreshSessionId: string;
  readonly rememberMe: boolean;
}

export type AuthActionResult = Record<string, never>;

export interface AuthenticatedRouteSessionResult {
  readonly sessionResponse: AuthSessionResponseData;
  readonly tenantContextSession: TenantContextAuthenticatedSession;
}

interface ResolvedAccessSession {
  readonly loginContext: AuthLoginContext;
  readonly accessTokenPayload: AuthAccessTokenPayload;
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
    @Inject(AuthSessionService)
    private readonly authSessionService: AuthSessionService,
    @Inject(PasswordResetTokenStore)
    private readonly passwordResetTokenStore: PasswordResetTokenStore,
    @Inject(EmailVerificationTokenStore)
    private readonly emailVerificationTokenStore: EmailVerificationTokenStore,
    @Inject(SecureTokenService)
    private readonly secureTokenService: SecureTokenService,
    @Inject(TokenHashingService)
    private readonly tokenHashingService: TokenHashingService,
  ) {}

  signupOwner(): never {
    return this.authUnavailable();
  }

  async login(
    request: LoginRequest,
    context: AuthLoginRequestContext = {},
  ): Promise<AuthLoginResult> {
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

    const rememberMe = request.remember_me === true;
    const refreshSession = await this.createRefreshSessionForLogin({
      loginContext,
      rememberMe,
      now: new Date(),
    });

    const signedAccessToken = await this.signAccessTokenForLoginContext({
      loginContext,
      sessionId: refreshSession.record.id,
    });

    return {
      access_token: signedAccessToken.access_token,
      expires_in_seconds: signedAccessToken.expires_in_seconds,
      user: this.toUserSummary(loginContext),
      tenant: loginContext.tenant,
      permissions: loginContext.permissions,
      branches: loginContext.branches,
      tenant_wide_branch_access: loginContext.tenantWideBranchAccess,
      refreshToken: refreshSession.refreshToken,
      refreshSessionId: refreshSession.record.id,
      rememberMe,
    };
  }

  async refresh(refreshToken: string | null | undefined): Promise<AuthRefreshResult> {
    const {
      session: currentSession,
      refreshTokenHash: currentRefreshTokenHash,
      now,
    } = await this.findActiveRefreshSessionForToken(refreshToken);

    const loginContext = await this.authUserStore.findActiveLoginContextByUserId({
      userId: currentSession.userId,
    });

    if (loginContext === null) {
      await this.authSessionService.revokeCurrentRefreshSession({
        sessionId: currentSession.id,
        revokedAt: now,
      });

      throw this.invalidRefreshSession();
    }

    const replacementRefreshToken = this.secureTokenService.generateOpaqueToken();
    const replacementSessionId = randomUUID();

    const replacementSession = await this.authSessionService.rotateRefreshSession({
      currentSessionId: currentSession.id,
      currentRefreshTokenHash,
      replacementSessionId,
      replacementRefreshTokenHash: this.tokenHashingService.hashToken(replacementRefreshToken),
      rotatedAt: now,
    });

    if (replacementSession === null) {
      throw this.invalidRefreshSession();
    }

    const signedAccessToken = await this.signAccessTokenForLoginContext({
      loginContext,
      sessionId: replacementSession.id,
    });

    return {
      access_token: signedAccessToken.access_token,
      expires_in_seconds: signedAccessToken.expires_in_seconds,
      refreshToken: replacementRefreshToken,
      refreshSessionId: replacementSession.id,
      rememberMe: replacementSession.rememberMe,
    };
  }

  async logout(refreshToken: string | null | undefined): Promise<AuthActionResult> {
    const { session, now } = await this.findActiveRefreshSessionForToken(refreshToken);

    await this.authSessionService.revokeCurrentRefreshSession({
      sessionId: session.id,
      revokedAt: now,
    });

    return {};
  }

  async logoutAll(refreshToken: string | null | undefined): Promise<AuthActionResult> {
    const { session, now } = await this.findActiveRefreshSessionForToken(refreshToken);

    await this.authSessionService.revokeAllRefreshSessionsForUser({
      userId: session.userId,
      revokedAt: now,
    });

    return {};
  }

  async resendEmailVerification(
    refreshToken: string | null | undefined,
  ): Promise<AuthActionResult> {
    const { session, now } = await this.findActiveRefreshSessionForToken(refreshToken);

    const loginContext = await this.authUserStore.findActiveLoginContextByUserId({
      userId: session.userId,
    });

    if (loginContext === null) {
      await this.authSessionService.revokeCurrentRefreshSession({
        sessionId: session.id,
        revokedAt: now,
      });

      throw this.invalidRefreshSession();
    }

    if (loginContext.user.emailVerifiedAt !== null) {
      return {};
    }

    const normalizedEmail = normalizeAuthRateLimitEmailKey(loginContext.user.email);

    await this.assertEmailVerificationResendRateLimitAllowed(normalizedEmail);

    await this.recordEmailVerificationResendAttempt({
      normalizedEmail,
      tenantId: loginContext.user.tenantId,
      userId: loginContext.user.id,
    });

    await this.createEmailVerificationTokenForUser({
      userId: loginContext.user.id,
      email: loginContext.user.email,
      now,
    });

    return {};
  }

  async confirmEmailVerification(
    request: EmailVerificationConfirmRequest,
  ): Promise<AuthActionResult> {
    const now = new Date();
    const tokenHash = this.tokenHashingService.hashToken(request.token);

    const token = await this.emailVerificationTokenStore.consumeActiveByTokenHash(tokenHash, now);

    if (token === null) {
      throw this.invalidEmailVerificationToken();
    }

    const verified = await this.authUserStore.markEmailVerified({
      userId: token.userId,
      email: token.email,
      emailVerifiedAt: now,
    });

    if (!verified) {
      throw this.invalidEmailVerificationToken();
    }

    return {};
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<AuthActionResult> {
    const normalizedEmail = normalizeAuthRateLimitEmailKey(request.email);

    await this.assertPasswordResetRateLimitAllowed(normalizedEmail);

    const loginContext = await this.authUserStore.findActiveLoginContextByNormalizedEmail({
      normalizedEmail,
    });

    await this.recordPasswordResetAttempt({
      normalizedEmail,
      tenantId: loginContext?.user.tenantId ?? null,
      userId: loginContext?.user.id ?? null,
    });

    if (loginContext === null) {
      return {};
    }

    await this.createPasswordResetTokenForUser({
      userId: loginContext.user.id,
      now: new Date(),
    });

    return {};
  }

  async resetPassword(request: ResetPasswordRequest): Promise<AuthActionResult> {
    const now = new Date();
    const tokenHash = this.tokenHashingService.hashToken(request.token);

    const token = await this.passwordResetTokenStore.consumeActiveByTokenHash(tokenHash, now);

    if (token === null) {
      throw this.invalidPasswordResetToken();
    }

    await this.updatePasswordAndRevokeSessions({
      userId: token.userId,
      newPassword: request.new_password,
      changedAt: now,
    });

    return {};
  }

  async changePassword(
    request: ChangePasswordRequest,
    refreshToken: string | null | undefined,
  ): Promise<AuthActionResult> {
    const { session, now } = await this.findActiveRefreshSessionForToken(refreshToken);

    const loginContext = await this.authUserStore.findActiveLoginContextByUserId({
      userId: session.userId,
    });

    if (loginContext === null) {
      await this.authSessionService.revokeCurrentRefreshSession({
        sessionId: session.id,
        revokedAt: now,
      });

      throw this.invalidRefreshSession();
    }

    const currentPasswordMatches = await this.verifyPasswordSafely(
      request.current_password,
      loginContext.user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw GarageOsApiException.unauthenticated('Current password is invalid.');
    }

    await this.updatePasswordAndRevokeSessions({
      userId: session.userId,
      newPassword: request.new_password,
      changedAt: now,
    });

    return {};
  }

  private getBearerAccessToken(authorizationHeader: string | null | undefined): string {
    const normalizedHeader = authorizationHeader?.trim();

    if (normalizedHeader === undefined || normalizedHeader.length === 0) {
      throw this.invalidAccessSession();
    }

    const [scheme, token, ...extraParts] = normalizedHeader.split(/\s+/);

    if (
      scheme?.toLowerCase() !== 'bearer' ||
      token === undefined ||
      token.length === 0 ||
      extraParts.length > 0
    ) {
      throw this.invalidAccessSession();
    }

    return token;
  }

  private assertAccessTokenMatchesRefreshSession(
    accessTokenPayload: AuthAccessTokenPayload,
    refreshSession: RefreshSessionRecord,
  ): void {
    if (
      refreshSession.id !== accessTokenPayload.session_id ||
      refreshSession.userId !== accessTokenPayload.user_id ||
      refreshSession.tenantId !== accessTokenPayload.tenant_id
    ) {
      throw this.invalidAccessSession();
    }
  }

  private assertAccessTokenMatchesLoginContext(
    accessTokenPayload: AuthAccessTokenPayload,
    loginContext: AuthLoginContext,
  ): void {
    if (
      loginContext.user.id !== accessTokenPayload.user_id ||
      loginContext.user.userType !== accessTokenPayload.user_type ||
      loginContext.user.tenantId !== accessTokenPayload.tenant_id
    ) {
      throw this.invalidAccessSession();
    }
  }

  private buildSessionAccess(loginContext: AuthLoginContext): AuthSessionAccessSummary {
    if (loginContext.user.emailVerifiedAt === null) {
      return {
        can_access_operational_modules: false,
        read_only: false,
      };
    }

    const tenantStatus = loginContext.tenant?.status ?? null;

    switch (tenantStatus) {
      case 'active':
      case 'grace_period':
        return {
          can_access_operational_modules: true,
          read_only: false,
        };

      case 'read_only':
        return {
          can_access_operational_modules: true,
          read_only: true,
        };

      case 'pending_setup':
      case 'suspended':
      case 'pending_deletion':
      case 'deleted':
      case null:
        return {
          can_access_operational_modules: false,
          read_only: false,
        };
    }
  }

  private async assertEmailVerificationResendRateLimitAllowed(
    normalizedEmail: string,
  ): Promise<void> {
    await this.authRateLimitService.assertAllowed({
      rule: AUTH_RATE_LIMIT_RULES.EMAIL_VERIFICATION_RESEND,
      keyParts: ['account', normalizedEmail],
    });
  }

  private async recordEmailVerificationResendAttempt(input: {
    readonly normalizedEmail: string;
    readonly tenantId: string | null;
    readonly userId: string | null;
  }): Promise<void> {
    await this.authRateLimitService.recordAttempt({
      rule: AUTH_RATE_LIMIT_RULES.EMAIL_VERIFICATION_RESEND,
      keyParts: ['account', input.normalizedEmail],
      tenantId: input.tenantId,
      userId: input.userId,
      ipAddress: null,
    });
  }

  private async createEmailVerificationTokenForUser(input: {
    readonly userId: string;
    readonly email: string;
    readonly now: Date;
  }): Promise<void> {
    const verificationToken = this.secureTokenService.generateOpaqueToken();

    await this.emailVerificationTokenStore.create({
      id: randomUUID(),
      userId: input.userId,
      email: input.email,
      tokenHash: this.tokenHashingService.hashToken(verificationToken),
      expiresAt: this.buildEmailVerificationTokenExpiresAt(input.now),
    });
  }

  private buildEmailVerificationTokenExpiresAt(now: Date): Date {
    return new Date(
      now.getTime() + AUTH_SECURITY.EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_HOURS * 60 * 60 * 1000,
    );
  }

  private async assertPasswordResetRateLimitAllowed(normalizedEmail: string): Promise<void> {
    await this.authRateLimitService.assertAllowed({
      rule: AUTH_RATE_LIMIT_RULES.PASSWORD_RESET,
      keyParts: ['account', normalizedEmail],
    });
  }

  private async recordPasswordResetAttempt(input: {
    readonly normalizedEmail: string;
    readonly tenantId: string | null;
    readonly userId: string | null;
  }): Promise<void> {
    await this.authRateLimitService.recordAttempt({
      rule: AUTH_RATE_LIMIT_RULES.PASSWORD_RESET,
      keyParts: ['account', input.normalizedEmail],
      tenantId: input.tenantId,
      userId: input.userId,
      ipAddress: null,
    });
  }

  private async createPasswordResetTokenForUser(input: {
    readonly userId: string;
    readonly now: Date;
  }): Promise<void> {
    const resetToken = this.secureTokenService.generateOpaqueToken();

    await this.passwordResetTokenStore.create({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: this.tokenHashingService.hashToken(resetToken),
      expiresAt: this.buildPasswordResetTokenExpiresAt(input.now),
    });
  }

  private buildPasswordResetTokenExpiresAt(now: Date): Date {
    return new Date(
      now.getTime() + AUTH_SECURITY.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES * 60 * 1000,
    );
  }

  private async updatePasswordAndRevokeSessions(input: {
    readonly userId: string;
    readonly newPassword: string;
    readonly changedAt: Date;
  }): Promise<void> {
    const passwordHash = await this.passwordHashingService.hashPassword(input.newPassword);

    await this.authUserStore.updatePasswordHash({
      userId: input.userId,
      passwordHash,
      passwordChangedAt: input.changedAt,
    });

    await this.authSessionService.revokeAllRefreshSessionsForUser({
      userId: input.userId,
      revokedAt: input.changedAt,
    });
  }

  async getSession(
    authorizationHeader: string | null | undefined,
  ): Promise<AuthSessionResponseData> {
    const routeSession = await this.getAuthenticatedRouteSession(authorizationHeader);

    return routeSession.sessionResponse;
  }

  async getAuthenticatedRouteSession(
    authorizationHeader: string | null | undefined,
  ): Promise<AuthenticatedRouteSessionResult> {
    const resolved = await this.resolveLoginContextForAccessSession(authorizationHeader);

    return {
      sessionResponse: this.toSessionResponseData(resolved.loginContext),
      tenantContextSession: this.toTenantContextAuthenticatedSession(resolved),
    };
  }

  private async resolveLoginContextForAccessSession(
    authorizationHeader: string | null | undefined,
  ): Promise<ResolvedAccessSession> {
    const accessToken = this.getBearerAccessToken(authorizationHeader);
    const accessTokenPayload = await this.accessTokenService.verify(accessToken);
    const now = new Date();

    const refreshSession = await this.authSessionService.findActiveRefreshSessionById({
      sessionId: accessTokenPayload.session_id,
      now,
    });

    if (refreshSession === null) {
      throw this.invalidAccessSession();
    }

    this.assertAccessTokenMatchesRefreshSession(accessTokenPayload, refreshSession);

    const loginContext = await this.authUserStore.findActiveLoginContextByUserId({
      userId: accessTokenPayload.user_id,
    });

    if (loginContext === null) {
      throw this.invalidAccessSession();
    }

    this.assertAccessTokenMatchesLoginContext(accessTokenPayload, loginContext);

    return {
      loginContext,
      accessTokenPayload,
    };
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

  private async createRefreshSessionForLogin(input: {
    readonly loginContext: AuthLoginContext;
    readonly rememberMe: boolean;
    readonly now: Date;
  }): Promise<{
    readonly record: Awaited<ReturnType<AuthSessionService['createRefreshSession']>>;
    readonly refreshToken: string;
  }> {
    const refreshToken = this.secureTokenService.generateOpaqueToken();

    const record = await this.authSessionService.createRefreshSession({
      id: randomUUID(),
      userId: input.loginContext.user.id,
      tenantId: input.loginContext.user.tenantId,
      tokenFamilyId: randomUUID(),
      refreshTokenHash: this.tokenHashingService.hashToken(refreshToken),
      rememberMe: input.rememberMe,
      expiresAt: this.buildRefreshSessionExpiresAt(input.rememberMe, input.now),
    });

    return {
      record,
      refreshToken,
    };
  }

  private buildRefreshSessionExpiresAt(rememberMe: boolean, now: Date): Date {
    const ttlSeconds = rememberMe
      ? AUTH_SESSION_POLICY.rememberMeRefreshSessionMaxAgeSeconds
      : AUTH_SECURITY.STANDARD_REFRESH_SESSION_EXPIRES_IN_DAYS * 24 * 60 * 60;

    return new Date(now.getTime() + ttlSeconds * 1000);
  }

  private async findActiveRefreshSessionForToken(refreshToken: string | null | undefined): Promise<{
    readonly session: RefreshSessionRecord;
    readonly refreshTokenHash: string;
    readonly now: Date;
  }> {
    const normalizedRefreshToken = refreshToken?.trim();

    if (normalizedRefreshToken === undefined || normalizedRefreshToken.length === 0) {
      throw this.invalidRefreshSession();
    }

    const now = new Date();
    const refreshTokenHash = this.tokenHashingService.hashToken(normalizedRefreshToken);

    const session = await this.authSessionService.findActiveRefreshSession({
      refreshTokenHash,
      now,
    });

    if (session === null) {
      throw this.invalidRefreshSession();
    }

    return { session, refreshTokenHash, now };
  }

  private async signAccessTokenForLoginContext(input: {
    readonly loginContext: AuthLoginContext;
    readonly sessionId: string;
  }): Promise<Awaited<ReturnType<AccessTokenService['sign']>>> {
    return this.accessTokenService.sign({
      user_id: input.loginContext.user.id,
      user_type: input.loginContext.user.userType,
      tenant_id: input.loginContext.user.tenantId,
      session_id: input.sessionId,
      email_verified: input.loginContext.user.emailVerifiedAt !== null,
    });
  }

  private toSessionResponseData(loginContext: AuthLoginContext): AuthSessionResponseData {
    return {
      user: this.toUserSummary(loginContext),
      tenant: loginContext.tenant,
      effective_permissions: loginContext.permissions,
      branches: loginContext.branches,
      tenant_wide_branch_access: loginContext.tenantWideBranchAccess,
      effective_plan: loginContext.effectivePlan,
      subscription: loginContext.subscription,
      access: this.buildSessionAccess(loginContext),
    };
  }

  private toTenantContextAuthenticatedSession(
    resolved: ResolvedAccessSession,
  ): TenantContextAuthenticatedSession {
    const { loginContext, accessTokenPayload } = resolved;

    return {
      actor: {
        user_id: loginContext.user.id,
        user_type: loginContext.user.userType,
        tenant_id: loginContext.user.tenantId,
        session_id: accessTokenPayload.session_id,
        email_verified: loginContext.user.emailVerifiedAt !== null,
        support_access_session_id: null,
      },
      tenant:
        loginContext.tenant === null
          ? null
          : {
              id: loginContext.tenant.id,
              status: loginContext.tenant.status,
            },
      effective_permissions: loginContext.permissions,
      branches: loginContext.branches.map((branch) => ({
        id: branch.id,
      })),
      tenant_wide_branch_access: loginContext.tenantWideBranchAccess,
      subscription_status_source:
        loginContext.subscriptionStatusSource ?? SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    };
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

  private invalidAccessSession(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Access session is invalid or expired.');
  }

  private invalidCredentials(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Invalid email or password.');
  }

  private invalidRefreshSession(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Refresh session is invalid or expired.');
  }

  private invalidPasswordResetToken(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Password reset token is invalid or expired.');
  }

  private invalidEmailVerificationToken(): GarageOsApiException {
    return GarageOsApiException.unauthenticated('Email verification token is invalid or expired.');
  }

  private authUnavailable(): never {
    throw GarageOsApiException.serviceUnavailable(
      'Authentication routes are available, but authentication is not implemented yet.',
    );
  }
}
