import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../shared/database/database.module';
import { AuthController } from './api/auth.controller';
import { AUTH_RATE_LIMIT_EXPORTS, AUTH_RATE_LIMIT_PROVIDERS } from './auth-rate-limit.providers';
import { AuthRateLimitService } from './application/auth-rate-limit.service';
import { AuthService } from './application/auth.service';
import { AuthTokenTransportService } from './application/auth-token-transport.service';
import { PasswordHashingService } from './application/password-hashing.service';
import { SecureTokenService } from './application/secure-token.service';
import { TokenHashingService } from './application/token-hashing.service';
import { AUTH_SESSION_EXPORTS, AUTH_SESSION_PROVIDERS } from './auth-session.providers';
import {
  ACCESS_TOKEN_SIGNING_OPTIONS,
  AccessTokenService,
  AccessTokenSigningOptions,
} from './security/access-token.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashingService,
    SecureTokenService,
    TokenHashingService,
    AuthTokenTransportService,
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
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    SecureTokenService,
    TokenHashingService,
    AuthTokenTransportService,
    AccessTokenService,
    ...AUTH_RATE_LIMIT_EXPORTS,
    ...AUTH_SESSION_EXPORTS,
  ],
})
export class AuthModule {}
