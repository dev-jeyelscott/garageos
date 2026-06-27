import { RoleStore } from './application/role.store';
import { PostgresRoleRepository } from './persistence/postgres-role.repository';

export const ROLE_PROVIDERS = [
  {
    provide: RoleStore,
    useClass: PostgresRoleRepository,
  },
] as const;
