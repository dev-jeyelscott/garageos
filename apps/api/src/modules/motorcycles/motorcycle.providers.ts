import { MotorcycleStore } from './application/motorcycle.store';
import { PostgresMotorcycleRepository } from './persistence/postgres-motorcycle.repository';

export const MOTORCYCLE_PROVIDERS = [
  {
    provide: MotorcycleStore,
    useClass: PostgresMotorcycleRepository,
  },
] as const;
