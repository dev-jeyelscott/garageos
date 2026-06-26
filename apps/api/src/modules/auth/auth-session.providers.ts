import { AuthSessionService } from './application/auth-session.service';
import { RefreshSessionStore } from './application/refresh-session.store';
import { PostgresRefreshSessionRepository } from './persistence/refresh-session.repository';

export const AUTH_SESSION_PROVIDERS = [
  AuthSessionService,
  {
    provide: RefreshSessionStore,
    useClass: PostgresRefreshSessionRepository,
  },
] as const;

export const AUTH_SESSION_EXPORTS = [AuthSessionService] as const;
