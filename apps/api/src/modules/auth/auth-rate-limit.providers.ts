import { AuthRateLimitService } from './application/auth-rate-limit.service';
import { AuthRateLimitStore } from './application/auth-rate-limit.store';
import { PostgresAuthRateLimitRepository } from './persistence/postgres-auth-rate-limit.repository';

export const AUTH_RATE_LIMIT_PROVIDERS = [
  AuthRateLimitService,
  {
    provide: AuthRateLimitStore,
    useClass: PostgresAuthRateLimitRepository,
  },
] as const;

export const AUTH_RATE_LIMIT_EXPORTS = [AuthRateLimitService] as const;
