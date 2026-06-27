import { PlatformTenantOperationsStore } from './application/platform-tenant-operations.store';
import { PostgresPlatformTenantOperationsRepository } from './persistence/postgres-platform-tenant-operations.repository';

export const PLATFORM_TENANT_OPERATIONS_PROVIDERS = [
  {
    provide: PlatformTenantOperationsStore,
    useClass: PostgresPlatformTenantOperationsRepository,
  },
] as const;
