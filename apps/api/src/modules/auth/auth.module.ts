import { Module } from '@nestjs/common';

import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { PasswordHashingService } from './application/password-hashing.service';
import { SecureTokenService } from './application/secure-token.service';
import { TokenHashingService } from './application/token-hashing.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordHashingService, SecureTokenService, TokenHashingService],
  exports: [AuthService, PasswordHashingService, SecureTokenService, TokenHashingService],
})
export class AuthModule {}
