import type { AuthTenantStatus } from '../../auth/types/auth-session';
import type { PlatformTenantListItem } from '../tenants/platform-tenant.types';

export type PlatformOverviewState =
  | {
      readonly status: 'idle' | 'loading';
      readonly tenants: readonly PlatformTenantListItem[];
    }
  | {
      readonly status: 'loaded';
      readonly tenants: readonly PlatformTenantListItem[];
    }
  | {
      readonly status: 'error';
      readonly tenants: readonly PlatformTenantListItem[];
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export type PlatformTenantStatusCounts = Record<AuthTenantStatus, number>;

export interface PlatformAttentionItem {
  readonly tenant: PlatformTenantListItem;
  readonly issue: string;
  readonly recommendedAction: string;
}

export interface PlatformOverviewPermissions {
  readonly canReadTenants: boolean;
  readonly canCreateTenant: boolean;
  readonly canReadAuditLogs: boolean;
  readonly canStartSupportAccess: boolean;
  readonly canManagePlans: boolean;
}
