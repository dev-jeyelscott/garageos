import type {
  TenantMoreMenuItem,
  TenantPlannedRouteConfig,
  TenantPlannedRouteKey,
} from '../types/tenant-route.types';

export const tenantPlannedRouteConfigs: Record<TenantPlannedRouteKey, TenantPlannedRouteConfig> = {
  'job-orders': {
    title: 'Job Orders',
    eyebrow: 'Service operations',
    description:
      'Protected route foundation for job order service workflows. Full job order lists, creation, status transitions, mechanic assignment, file attachments, inventory reservation, completion, cancellation, and release workflows remain disabled until their documented API slices are implemented.',
    routePath: '/job-orders',
    primaryPermission: 'job_orders.read',
    primaryPermissionLabel: 'job_orders.read',
    plannedWorkflows: [
      'Job order list and search',
      'Job order detail and status history',
      'New job order intake',
      'Mechanic assignment and work-session links',
      'Part reservation and release actions',
      'Completion, cancellation, release, and correction workflows',
    ],
    guardrails: [
      'Do not create job orders from this scaffold.',
      'Do not invent service metrics or queue counts.',
      'Do not change status through freeform dropdowns.',
      'Keep inventory-consuming actions disabled until FIFO reservation and consumption APIs are wired.',
    ],
  },
  customers: {
    title: 'Customers',
    eyebrow: 'Customer records',
    description:
      'Protected route foundation for tenant-wide customer lookup and intake. Full customer list, create, detail, edit, merge, soft-delete, restore, motorcycle links, branch-filtered history, notes, files, and audit panels remain disabled until their documented API slices are implemented.',
    routePath: '/customers',
    primaryPermission: 'customers.read',
    primaryPermissionLabel: 'customers.read',
    plannedWorkflows: [
      'Customer list and search',
      'Customer detail with linked motorcycles',
      'Create and edit customer records',
      'Duplicate warning and merge review',
      'Soft-delete and restore flows',
      'Branch-filtered customer operational history',
    ],
    guardrails: [
      'Do not create or update customer records from this scaffold.',
      'Do not expose branch-specific histories without branch access checks.',
      'Do not imply a customer portal or customer login.',
      'Keep file upload disabled until the files module is wired.',
    ],
  },
  'inventory-stock-balances': {
    title: 'Stock Balances',
    eyebrow: 'Inventory',
    description:
      'Protected route foundation for branch-aware inventory stock lookup. Full product search, stock balances, low-stock alerts, ledger history, FIFO layers, reservations, adjustments, transfers, receiving, and supplier-linked inventory workflows remain disabled until their documented API slices are implemented.',
    routePath: '/inventory/stock-balances',
    primaryPermission: 'inventory.read',
    primaryPermissionLabel: 'inventory.read or products.read',
    plannedWorkflows: [
      'Branch-aware stock balance lookup',
      'Product and SKU search',
      'Low-stock alert list',
      'Inventory ledger and stock movement history',
      'FIFO layer and reservation visibility',
      'Adjustment, transfer, and receiving workflow entry points',
    ],
    guardrails: [
      'Do not directly edit stock quantities.',
      'Do not create inventory ledger entries from this scaffold.',
      'Do not invent stock counts, costs, or low-stock metrics.',
      'Keep stock-changing actions disabled until ledger/FIFO APIs are wired.',
    ],
  },
  more: {
    title: 'More',
    eyebrow: 'Tenant menu',
    description:
      'Protected route foundation for secondary tenant modules. This screen should become the permission-aware entry point for invoices, payments, purchases, suppliers, reports, reminders, employees, roles, settings, audit logs, exports, background jobs, and offline-cache views as those documented slices are implemented.',
    routePath: '/more',
    primaryPermission: null,
    primaryPermissionLabel: 'Permission varies by destination',
    plannedWorkflows: [
      'Invoices, payments, receipts, refunds, AR, and cashier workflows',
      'Purchases, suppliers, supplier returns, AP, and supplier payment workflows',
      'Reports, report exports, dashboard drilldowns, and branch comparison reports',
      'Reminders, notifications, files, exports, audit logs, and background jobs',
      'Employees, roles, permissions, branches, shop settings, and billing settings',
      'Offline recent-record cache entry point',
    ],
    guardrails: [
      'Do not add undocumented modules.',
      'Do not add standalone retail POS, customer portal, payroll, full accounting, or 2FA links.',
      'Do not enable destination links until their route scaffolds or real module screens exist.',
      'Keep each destination permission-aware when the menu is expanded.',
    ],
  },
};

export const tenantMoreMenuItems: readonly TenantMoreMenuItem[] = [
  {
    title: 'Dashboard',
    group: 'Available route foundations',
    description:
      'Tenant dashboard route foundation for subscription warnings, branch context, session state, and future documented dashboard widgets.',
    routePath: '/dashboard',
    routeExists: true,
    requiredPermissions: [],
    plannedScope: [
      'Dashboard summary widgets',
      'Subscription warning panel',
      'Branch-aware dashboard filters',
    ],
  },
  {
    title: 'Job Orders',
    group: 'Available route foundations',
    description:
      'Protected service operations route foundation for job order list, detail, intake, mechanic assignment, and status workflows.',
    routePath: '/job-orders',
    routeExists: true,
    requiredPermissions: ['job_orders.read'],
    plannedScope: [
      'Job order list and search',
      'Job order detail and history',
      'Service intake and workflow actions',
    ],
  },
  {
    title: 'Customers',
    group: 'Available route foundations',
    description:
      'Protected customer route foundation for tenant-wide customer lookup, customer detail, motorcycle links, and branch-filtered history.',
    routePath: '/customers',
    routeExists: true,
    requiredPermissions: ['customers.read'],
    plannedScope: ['Customer lookup', 'Customer detail', 'Linked motorcycles and service history'],
  },
  {
    title: 'Stock Balances',
    group: 'Available route foundations',
    description:
      'Protected inventory route foundation for branch-aware stock lookup, product search, ledger history, FIFO layers, and reservations.',
    routePath: '/inventory/stock-balances',
    routeExists: true,
    requiredPermissions: ['inventory.read', 'products.read'],
    plannedScope: [
      'Branch stock balance lookup',
      'Product and SKU search',
      'Ledger and FIFO visibility',
    ],
  },
  {
    title: 'Motorcycles, Services, and Estimates',
    group: 'Service operations',
    description:
      'Documented service-advisor workflow group for motorcycle records, service catalog, estimates, approvals, and estimate conversion.',
    routePath: '/motorcycles',
    routeExists: false,
    requiredPermissions: ['motorcycles.read', 'services.read', 'estimates.read'],
    plannedScope: [
      'Motorcycle records',
      'Service catalog',
      'Estimate list, approval, and conversion',
    ],
  },
  {
    title: 'Mechanic Sessions',
    group: 'Service operations',
    description:
      'Documented mechanic work-session group for assigned jobs, active sessions, pause/resume, finish, and work history.',
    routePath: '/mechanic-sessions',
    routeExists: false,
    requiredPermissions: ['mechanic_sessions.read'],
    plannedScope: [
      'Assigned mechanic jobs',
      'Work-session history',
      'Pause, resume, and finish workflows',
    ],
  },
  {
    title: 'Invoices, Payments, Receipts, and Refunds',
    group: 'Cashier workflows',
    description:
      'Documented financial workflow group for invoices, manual payments, immutable receipts, refunds, voids, and accounts receivable.',
    routePath: '/invoices',
    routeExists: false,
    requiredPermissions: ['invoices.read', 'payments.read', 'receipts.read'],
    plannedScope: [
      'Invoice list and detail',
      'Manual payment recording',
      'Receipt viewing and refund workflows',
    ],
  },
  {
    title: 'Purchases, Suppliers, and AP',
    group: 'Inventory and purchasing',
    description:
      'Documented purchasing group for suppliers, purchase orders, receiving, supplier returns, supplier payments, credits, and accounts payable.',
    routePath: '/purchase-orders',
    routeExists: false,
    requiredPermissions: ['purchases.read', 'suppliers.read', 'supplier_returns.read'],
    plannedScope: [
      'Supplier records',
      'Purchase orders and receiving',
      'Supplier returns and AP views',
    ],
  },
  {
    title: 'Inventory Workflows',
    group: 'Inventory and purchasing',
    description:
      'Documented inventory workflow group for adjustments, approvals, transfers, reservations, FIFO visibility, and immutable ledger views.',
    routePath: '/inventory-adjustments',
    routeExists: false,
    requiredPermissions: ['inventory.read', 'inventory.adjust', 'inventory.transfer.create'],
    plannedScope: [
      'Inventory adjustments',
      'Inventory transfers',
      'Reservation and FIFO workflow visibility',
    ],
  },
  {
    title: 'Reports',
    group: 'Management',
    description:
      'Documented report group for basic, branch, and advanced reports with plan-aware access and export behavior.',
    routePath: '/reports',
    routeExists: false,
    requiredPermissions: ['reports.view_basic', 'reports.view_branch', 'reports.view_advanced'],
    plannedScope: ['Basic reports', 'Branch comparison reports', 'Advanced operational reports'],
  },
  {
    title: 'Expenses',
    group: 'Management',
    description:
      'Documented operating expense group for expense records, category management, updates, and void behavior.',
    routePath: '/expenses',
    routeExists: false,
    requiredPermissions: ['expenses.read'],
    plannedScope: ['Expense list', 'Expense detail', 'Expense category management'],
  },
  {
    title: 'Reminders and Notifications',
    group: 'Engagement',
    description:
      'Documented reminder and internal notification group with plan-aware channel enforcement and delivery status visibility.',
    routePath: '/reminders',
    routeExists: false,
    requiredPermissions: ['reminders.read', 'notifications.read'],
    plannedScope: [
      'Customer reminders',
      'Notification center',
      'Notification preferences and delivery status',
    ],
  },
  {
    title: 'Files, Exports, and Background Jobs',
    group: 'Operations',
    description:
      'Documented operational support group for files, full tenant export packaging, report exports, and background job visibility.',
    routePath: '/exports',
    routeExists: false,
    requiredPermissions: ['files.read', 'shop.export_data', 'reports.export'],
    plannedScope: [
      'File attachment views',
      'Export job status',
      'Background job status and safe error summaries',
    ],
  },
  {
    title: 'Employees, Roles, and Permissions',
    group: 'Administration',
    description:
      'Documented tenant administration group for employees, invitations, role templates, branch assignments, and permission management.',
    routePath: '/employees',
    routeExists: false,
    requiredPermissions: ['users.read', 'roles.read', 'permissions.read'],
    plannedScope: [
      'Employee list and detail',
      'Role and permission management',
      'Branch assignment management',
    ],
  },
  {
    title: 'Branches and Settings',
    group: 'Administration',
    description:
      'Documented shop administration group for branches, shop profile, billing-related settings, notification preferences, and localization settings.',
    routePath: '/settings',
    routeExists: false,
    requiredPermissions: ['branches.read', 'shop.read', 'settings.update'],
    plannedScope: [
      'Branch management',
      'Shop profile and settings',
      'Billing and notification preferences',
    ],
  },
  {
    title: 'Audit Logs',
    group: 'Administration',
    description:
      'Documented audit visibility group for sanitized tenant audit records and critical workflow accountability.',
    routePath: '/audit-logs',
    routeExists: false,
    requiredPermissions: ['audit_logs.read'],
    plannedScope: [
      'Audit log list',
      'Audit log detail',
      'Actor, timestamp, and safe change summaries',
    ],
  },
  {
    title: 'Offline Cache',
    group: 'Offline read-only',
    description:
      'Documented PWA offline-cache group for recently viewed records in read-only mode only. No offline write queue is introduced.',
    routePath: '/offline-cache',
    routeExists: false,
    requiredPermissions: [],
    plannedScope: [
      'Recently viewed cached records',
      'Read-only offline messaging',
      'Offline write blockers',
    ],
  },
];
