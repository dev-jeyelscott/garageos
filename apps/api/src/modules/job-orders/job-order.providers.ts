import { JobOrderStore } from './application/job-order.store';
import { PostgresJobOrderRepository } from './persistence/postgres-job-order.repository';

export const JOB_ORDER_PROVIDERS = [
  {
    provide: JobOrderStore,
    useClass: PostgresJobOrderRepository,
  },
];
