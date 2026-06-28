import type { IconName } from './marketing-icons';

export type Feature = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
};

export type DashboardMetric = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: IconName;
  readonly tone?: 'success' | 'warning' | 'default';
};

export type WorkflowStep = {
  readonly title: string;
  readonly description: string;
};

export type RoleValue = {
  readonly role: string;
  readonly description: string;
  readonly icon: IconName;
};

export type TrustItem = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
};

export const navItems = [
  ['Product', '#product'],
  ['Workflow', '#workflow'],
  ['Features', '#features'],
  ['For Shops', '#roles'],
] as const;

export const dashboardMetrics: readonly DashboardMetric[] = [
  {
    label: 'Daily sales',
    value: 'PHP 48,500',
    detail: '+16% vs last month',
    icon: 'chart',
    tone: 'success',
  },
  {
    label: 'Pending jobs',
    value: '24',
    detail: '6 in progress',
    icon: 'wrench',
  },
  {
    label: 'Low stock',
    value: '12',
    detail: 'Needs reorder',
    icon: 'box',
    tone: 'warning',
  },
  {
    label: 'Open invoices',
    value: '6',
    detail: 'Awaiting payment',
    icon: 'receipt',
  },
];

export const features: readonly Feature[] = [
  {
    title: 'Job Orders',
    description:
      'Track repair work from intake, assignment, service progress, completion, and release.',
    icon: 'wrench',
  },
  {
    title: 'Inventory + FIFO',
    description:
      'See on-hand, reserved, available stock, branch balances, FIFO layers, and low-stock alerts.',
    icon: 'box',
  },
  {
    title: 'Invoices + Payments',
    description: 'Issue invoices, record partial or split payments, and keep receipts immutable.',
    icon: 'receipt',
  },
  {
    title: 'Customers + Motorcycles',
    description: 'Keep tenant-wide customer records and branch-aware motorcycle service history.',
    icon: 'shop',
  },
  {
    title: 'Reports',
    description:
      'Review operational, sales, inventory, receivables, payables, and branch-aware summaries.',
    icon: 'chart',
  },
  {
    title: 'Reminders',
    description:
      'Support service follow-ups and customer reminders through plan-supported channels.',
    icon: 'bell',
  },
];

export const workflowSteps: readonly WorkflowStep[] = [
  {
    title: 'Intake',
    description: 'Find or create the customer and motorcycle record.',
  },
  {
    title: 'Estimate',
    description: 'Prepare service, labor, and parts estimate lines.',
  },
  {
    title: 'Approval',
    description: 'Capture approval before converting work.',
  },
  {
    title: 'Job Order',
    description: 'Assign mechanics and track repair progress.',
  },
  {
    title: 'Parts Reservation',
    description: 'Reserve parts without allowing stock over-allocation.',
  },
  {
    title: 'Invoice',
    description: 'Bill completed work with clear balances.',
  },
  {
    title: 'Payment',
    description: 'Record payment and generate receipt history.',
  },
  {
    title: 'Reports',
    description: 'Review sales, inventory, AR/AP, and operations.',
  },
];

export const roleValues: readonly RoleValue[] = [
  {
    role: 'Owner / Manager',
    description: 'Monitor branches, employees, reports, exports, approvals, and audit visibility.',
    icon: 'roles',
  },
  {
    role: 'Service Advisor',
    description:
      'Handle customer lookup, motorcycle intake, estimates, job orders, notes, and history.',
    icon: 'checklist',
  },
  {
    role: 'Mechanic',
    description:
      'See assigned jobs, work sessions, repair notes, labor tasks, and service progress.',
    icon: 'wrench',
  },
  {
    role: 'Cashier',
    description: 'Issue invoices, record payments, view receipts, and process permitted refunds.',
    icon: 'credit-card',
  },
  {
    role: 'Inventory Clerk',
    description:
      'Lookup products, receive stock, manage transfers, adjustments, and low-stock actions.',
    icon: 'box',
  },
];

export const trustItems: readonly TrustItem[] = [
  {
    title: 'Mobile-first PWA',
    description: 'Designed for shop-floor use on phones, tablets, and desktops.',
    icon: 'gauge',
  },
  {
    title: 'Tenant and branch aware',
    description: 'Navigation and records follow tenant, branch, role, and permission context.',
    icon: 'shield',
  },
  {
    title: 'Read-only offline safety',
    description: 'Offline mode keeps recent views readable without allowing offline writes.',
    icon: 'offline',
  },
  {
    title: 'Audit-friendly workflows',
    description: 'Critical actions keep status history, actors, timestamps, and reasons visible.',
    icon: 'audit',
  },
];
