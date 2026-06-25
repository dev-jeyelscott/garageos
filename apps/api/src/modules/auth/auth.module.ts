import { Module } from '@nestjs/common';

import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { PasswordHashingService } from './application/password-hashing.service';
import { SecureTokenService } from './application/secure-token.service';
import { TokenHashingService } from './application/token-hashing.service';
import { AuthTokenTransportService } from './application/auth-token-transport.service';
import {
  ACCESS_TOKEN_SIGNING_OPTIONS,
  AccessTokenService,
  AccessTokenSigningOptions,
} from './security/access-token.service';

@Module({
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
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    SecureTokenService,
    TokenHashingService,
    AuthTokenTransportService,
  ],
})
export class AuthModule {}
