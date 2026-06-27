import { EmployeeStore } from './application/employee.store';
import { PostgresEmployeeRepository } from './persistence/postgres-employee.repository';

export const EMPLOYEE_PROVIDERS = [
  {
    provide: EmployeeStore,
    useClass: PostgresEmployeeRepository,
  },
] as const;
