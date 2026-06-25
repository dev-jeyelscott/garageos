import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordHashingService {
  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
    });
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }
}
