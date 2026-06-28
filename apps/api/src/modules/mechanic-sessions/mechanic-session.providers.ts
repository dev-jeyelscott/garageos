import { MechanicSessionStore } from './application/mechanic-session.store';
import { PostgresMechanicSessionRepository } from './persistence/postgres-mechanic-session.repository';

export const MECHANIC_SESSION_PROVIDERS = [
  {
    provide: MechanicSessionStore,
    useClass: PostgresMechanicSessionRepository,
  },
];
