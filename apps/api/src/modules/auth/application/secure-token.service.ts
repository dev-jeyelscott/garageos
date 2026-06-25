import { Injectable } from '@nestjs/common';
import { AUTH_SECURITY } from './auth-security.constants';
import { randomBytes } from 'node:crypto';

@Injectable()
export class SecureTokenService {
  generateOpaqueToken(byteLength = AUTH_SECURITY.RANDOM_TOKEN_BYTES): string {
    return randomBytes(byteLength).toString('base64url');
  }
}
