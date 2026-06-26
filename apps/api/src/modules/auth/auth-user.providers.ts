import { AuthUserStore } from './application/auth-user.store';
import { PostgresAuthUserRepository } from './persistence/postgres-auth-user.repository';

export const AUTH_USER_PROVIDERS = [
  {
    provide: AuthUserStore,
    useClass: PostgresAuthUserRepository,
  },
] as const;
