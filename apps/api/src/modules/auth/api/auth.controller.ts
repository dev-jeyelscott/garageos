import { Controller } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  /*
   * Step 2.5 intentionally exposes no route handlers yet.
   *
   * The documented routes are:
   * - POST /auth/signup-owner
   * - POST /auth/login
   * - POST /auth/refresh
   * - POST /auth/logout
   * - POST /auth/logout-all
   * - POST /auth/email-verification/resend
   * - POST /auth/email-verification/confirm
   * - POST /auth/password/forgot
   * - POST /auth/password/reset
   * - POST /auth/password/change
   * - GET  /auth/session
   *
   * We will add them incrementally once the required service, token,
   * validation, rate-limit, and guard foundations are ready.
   */
}
