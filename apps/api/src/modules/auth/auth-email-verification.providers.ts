import { EmailVerificationTokenStore } from './application/email-verification-token.store';
import { PostgresEmailVerificationTokenRepository } from './persistence/email-verification-token.repository';

export const AUTH_EMAIL_VERIFICATION_PROVIDERS = [
  {
    provide: EmailVerificationTokenStore,
    useClass: PostgresEmailVerificationTokenRepository,
  },
] as const;

export const AUTH_EMAIL_VERIFICATION_EXPORTS = [EmailVerificationTokenStore] as const;
