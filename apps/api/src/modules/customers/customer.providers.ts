import { CustomerStore } from './application/customer.store';
import { PostgresCustomerRepository } from './persistence/postgres-customer.repository';

export const CUSTOMER_PROVIDERS = [
  {
    provide: CustomerStore,
    useClass: PostgresCustomerRepository,
  },
] as const;
