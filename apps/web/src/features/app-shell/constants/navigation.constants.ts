import type { NavigationItem } from '../types/navigation-item';

export const tenantNavigationItems: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    requiredPermissions: ['reports.view_basic'],
  },
  {
    label: 'Customers',
    href: '/customers',
    requiredPermissions: ['customers.read'],
  },
  {
    label: 'Suppliers',
    href: '/suppliers',
    requiredPermissions: ['suppliers.read'],
  },
  {
    label: 'Purchases',
    href: '/purchase-orders',
    requiredPermissions: ['purchases.read'],
  },
  {
    label: 'Branches',
    href: '/branches',
    requiredPermissions: ['branches.read'],
  },
  {
    label: 'Employees',
    href: '/employees',
    requiredPermissions: ['users.read'],
  },
  {
    label: 'Roles',
    href: '/roles',
    requiredPermissions: ['roles.read'],
  },
  {
    label: 'Customer Tags',
    href: '/customer-tags',
    requiredPermissions: ['customers.read'],
  },
];
