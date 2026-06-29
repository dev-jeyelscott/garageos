import type { PlatformAuditLogListFilters } from './platform-audit-log.types';

export const platformAuditLogListPageSize = 50;

export const defaultPlatformAuditLogListFilters: PlatformAuditLogListFilters = {
  platform_admin_user_id: '',
  action: '',
  tenant_id: '',
  from: '',
  to: '',
};
