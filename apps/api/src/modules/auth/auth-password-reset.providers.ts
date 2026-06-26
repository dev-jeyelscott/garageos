import { PasswordResetTokenStore } from './application/password-reset-token.store';
import { PostgresPasswordResetTokenRepository } from './persistence/password-reset-token.repository';

export const AUTH_PASSWORD_RESET_PROVIDERS = [
  {
    provide: PasswordResetTokenStore,
    useClass: PostgresPasswordResetTokenRepository,
  },
] as const;

export const AUTH_PASSWORD_RESET_EXPORTS = [PasswordResetTokenStore] as const;
