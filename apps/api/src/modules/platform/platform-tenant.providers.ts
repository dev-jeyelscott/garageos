import { PlatformTenantStore } from './application/platform-tenant.store';
import { PostgresPlatformTenantRepository } from './persistence/postgres-platform-tenant.repository';

export const PLATFORM_TENANT_PROVIDERS = [
  {
    provide: PlatformTenantStore,
    useClass: PostgresPlatformTenantRepository,
  },
] as const;
