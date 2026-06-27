import { Module } from '@nestjs/common';

import { AuditModule } from '../../shared/audit/audit.module';
import { AuthorizationModule } from '../../shared/authorization/authorization.module';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthController } from './api/auth.controller';
import { AccessTokenAuthGuard } from './api/access-token-auth.guard';
import {
  AUTH_EMAIL_VERIFICATION_EXPORTS,
  AUTH_EMAIL_VERIFICATION_PROVIDERS,
} from './auth-email-verification.providers';
import {
  AUTH_PASSWORD_RESET_EXPORTS,
  AUTH_PASSWORD_RESET_PROVIDERS,
} from './auth-password-reset.providers';
import { AUTH_RATE_LIMIT_EXPORTS, AUTH_RATE_LIMIT_PROVIDERS } from './auth-rate-limit.providers';
import { AUTH_SESSION_EXPORTS, AUTH_SESSION_PROVIDERS } from './auth-session.providers';
import { AUTH_USER_PROVIDERS } from './auth-user.providers';
import { AuthService } from './application/auth.service';
import { AuthTokenTransportService } from './application/auth-token-transport.service';
import { PasswordHashingService } from './application/password-hashing.service';
import { SecureTokenService } from './application/secure-token.service';
import { TokenHashingService } from './application/token-hashing.service';
import {
  ACCESS_TOKEN_SIGNING_OPTIONS,
  AccessTokenService,
  type AccessTokenSigningOptions,
} from './security/access-token.service';
import { AUTH_OWNER_SIGNUP_PROVIDERS } from './auth-owner-signup.providers';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashingService,
    SecureTokenService,
    TokenHashingService,
    AuthTokenTransportService,
    AccessTokenAuthGuard,
    {
      provide: ACCESS_TOKEN_SIGNING_OPTIONS,
      useValue: {
        issuer: process.env.AUTH_ACCESS_TOKEN_ISSUER ?? 'garageos-api',
        audience: process.env.AUTH_ACCESS_TOKEN_AUDIENCE ?? 'garageos-pwa',
        secret: process.env.AUTH_ACCESS_TOKEN_SECRET ?? '',
      } satisfies AccessTokenSigningOptions,
    },
    AccessTokenService,
    ...AUTH_RATE_LIMIT_PROVIDERS,
    ...AUTH_SESSION_PROVIDERS,
    ...AUTH_USER_PROVIDERS,
    ...AUTH_PASSWORD_RESET_PROVIDERS,
    ...AUTH_EMAIL_VERIFICATION_PROVIDERS,
    ...AUTH_OWNER_SIGNUP_PROVIDERS,
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    SecureTokenService,
    TokenHashingService,
    AuthTokenTransportService,
    AccessTokenService,
    AccessTokenAuthGuard,
    ...AUTH_RATE_LIMIT_EXPORTS,
    ...AUTH_SESSION_EXPORTS,
    ...AUTH_PASSWORD_RESET_EXPORTS,
    ...AUTH_EMAIL_VERIFICATION_EXPORTS,
  ],
})
export class AuthModule {}
