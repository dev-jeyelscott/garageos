import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class TokenHashingService {
  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  verifyToken(token: string, expectedHash: string): boolean {
    const actualHash = this.hashToken(token);

    const actual = Buffer.from(actualHash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  }
}
