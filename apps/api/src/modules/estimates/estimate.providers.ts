import { EstimateStore } from './application/estimate.store';
import { PostgresEstimateRepository } from './persistence/postgres-estimate.repository';

export const ESTIMATE_PROVIDERS = [
  {
    provide: EstimateStore,
    useClass: PostgresEstimateRepository,
  },
];
