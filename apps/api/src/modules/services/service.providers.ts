import { ServiceStore } from './application/service.store';
import { PostgresServiceRepository } from './persistence/postgres-service.repository';

export const SERVICE_PROVIDERS = [
  {
    provide: ServiceStore,
    useClass: PostgresServiceRepository,
  },
] as const;
