import { OwnerSignupStore } from './application/owner-signup.store';
import { OwnerSignupService } from './application/owner-signup.service';
import { PostgresOwnerSignupRepository } from './persistence/postgres-owner-signup.repository';

export const AUTH_OWNER_SIGNUP_PROVIDERS = [
  OwnerSignupService,
  {
    provide: OwnerSignupStore,
    useClass: PostgresOwnerSignupRepository,
  },
] as const;
