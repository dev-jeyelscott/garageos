import type { ShellNavItem } from '../types/app-shell.types';

export const platformNavItems: readonly ShellNavItem[] = [
  {
    label: 'Overview',
    href: '/platform',
  },
  {
    label: 'Tenants',
    href: '/platform/tenants',
  },
  {
    label: 'Plans',
    disabledReason: 'Planned route: /platform/plans. Requires platform plan APIs.',
  },
  {
    label: 'Support Access',
    disabledReason:
      'Tenant-specific support access is available from tenant detail. Aggregate route is planned.',
  },
  {
    label: 'Exports',
    disabledReason:
      'Tenant export trigger is available from tenant detail. Aggregate export job route is planned.',
  },
  {
    label: 'Deletion Jobs',
    disabledReason:
      'Tenant deletion job route remains planned until deletion eligibility APIs are wired.',
  },
  {
    label: 'Platform Audit Logs',
    disabledReason: 'Planned route: /platform/audit-logs. Requires platform audit log API.',
  },
  {
    label: 'Settings',
    disabledReason: 'Planned route: /platform/settings. Only documented settings may be added.',
  },
];

export const tenantNavItems: readonly ShellNavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
  },
  {
    label: 'Job Orders',
    href: '/job-orders',
  },
  {
    label: 'Customers',
    href: '/customers',
  },
  {
    label: 'Inventory',
    href: '/inventory/stock-balances',
  },
  {
    label: 'More',
    href: '/more',
  },
];
