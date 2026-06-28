import type { IconName } from './marketing-icons';

export type Feature = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
  readonly outcome: string;
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
  readonly phase: string;
  readonly description: string;
  readonly outcome: string;
  readonly icon: IconName;
};

export type RoleValue = {
  readonly role: string;
  readonly description: string;
  readonly outcome: string;
  readonly icon: IconName;
};

export type TrustItem = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
};

export type ProofPoint = {
  readonly value: string;
  readonly label: string;
};

export const navItems = [
  ['Product', '#product'],
  ['Workflow', '#workflow'],
  ['For Shops', '#roles'],
  ['Trust', '#trust'],
] as const;

export const heroProofPoints: readonly ProofPoint[] = [
  {
    value: '1',
    label: 'workspace for jobs, stock, invoices, and reports',
  },
  {
    value: 'FIFO',
    label: 'inventory costing and reservation foundation',
  },
  {
    value: 'PWA',
    label: 'mobile-first access for the shop floor',
  },
];

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
    title: 'Job orders that stay visible',
    description:
      'Create service work, assign mechanics, track progress, record notes, and move jobs through clear workflow actions.',
    outcome: 'Less guessing about what is waiting, assigned, completed, or ready for release.',
    icon: 'wrench',
  },
  {
    title: 'Inventory with FIFO discipline',
    description:
      'Track on-hand, reserved, and available stock by branch while preserving FIFO layers and low-stock visibility.',
    outcome: 'Know what can be used before a job promises parts the shop does not actually have.',
    icon: 'box',
  },
  {
    title: 'Invoices, payments, and receipts',
    description:
      'Issue invoices, record partial or split payments, and keep receipt history immutable for cleaner cashier workflows.',
    outcome: 'Cleaner balances and fewer payment-history disputes.',
    icon: 'receipt',
  },
  {
    title: 'Customer and motorcycle history',
    description:
      'Keep customer records tenant-wide while preserving motorcycle service history across branch-aware operations.',
    outcome: 'Advisors can understand the motorcycle before opening the next job.',
    icon: 'shop',
  },
  {
    title: 'Reports for daily control',
    description:
      'Review operational, sales, inventory, receivable, payable, and branch-aware summaries from one reporting area.',
    outcome: 'Owners and managers get the signal without digging through disconnected files.',
    icon: 'chart',
  },
  {
    title: 'Reminders that support retention',
    description:
      'Manage service follow-ups and customer reminders through the notification channels available to the shop plan.',
    outcome: 'Keep service follow-up from depending on memory or scattered chat threads.',
    icon: 'bell',
  },
];

export const workflowSteps: readonly WorkflowStep[] = [
  {
    title: 'Intake',
    phase: 'Customer context',
    description: 'Find or create the customer and motorcycle record before work begins.',
    outcome: 'Start with the right owner, motorcycle, and branch context.',
    icon: 'shop',
  },
  {
    title: 'Estimate',
    phase: 'Scope and pricing',
    description: 'Prepare service, labor, and parts lines before the customer approves the work.',
    outcome: 'Set expectations before converting the quote into active shop work.',
    icon: 'checklist',
  },
  {
    title: 'Approval',
    phase: 'Accountable approval',
    description: 'Capture the approval method before the estimate becomes a job order.',
    outcome: 'Keep accountability attached to the work that was approved.',
    icon: 'shield',
  },
  {
    title: 'Job Order',
    phase: 'Active service work',
    description: 'Assign mechanics, track repair progress, and record service notes.',
    outcome: 'Make the current job state visible to advisors, mechanics, and managers.',
    icon: 'wrench',
  },
  {
    title: 'Parts Reservation',
    phase: 'Stock protection',
    description: 'Reserve needed parts without allowing available stock to be over-promised.',
    outcome: 'Protect inventory accuracy before parts are consumed.',
    icon: 'box',
  },
  {
    title: 'Invoice',
    phase: 'Controlled billing',
    description: 'Bill completed work with clear balances and controlled line allocations.',
    outcome: 'Reduce billing confusion before the customer reaches the cashier.',
    icon: 'receipt',
  },
  {
    title: 'Payment',
    phase: 'Receipt trail',
    description: 'Record payments and generate receipt history from the invoice.',
    outcome: 'Keep payment proof attached to the right customer and invoice.',
    icon: 'credit-card',
  },
  {
    title: 'Reports',
    phase: 'Management visibility',
    description: 'Review service, sales, inventory, AR/AP, and operational summaries.',
    outcome: 'Turn daily shop activity into management visibility.',
    icon: 'chart',
  },
];

export const roleValues: readonly RoleValue[] = [
  {
    role: 'Owner / Manager',
    description: 'Monitor branches, employees, reports, approvals, exports, and audit visibility.',
    outcome: 'See the business without chasing every counter, mechanic, or spreadsheet.',
    icon: 'roles',
  },
  {
    role: 'Service Advisor',
    description:
      'Handle customer lookup, motorcycle intake, estimates, job orders, notes, and history.',
    outcome: 'Move from customer conversation to service work without losing context.',
    icon: 'checklist',
  },
  {
    role: 'Mechanic',
    description:
      'See assigned jobs, work sessions, repair notes, labor tasks, and service progress.',
    outcome: 'Focus on the next repair instead of asking what changed.',
    icon: 'wrench',
  },
  {
    role: 'Cashier',
    description: 'Issue invoices, record payments, view receipts, and process permitted refunds.',
    outcome: 'Keep balances, receipts, and payment history clean at checkout.',
    icon: 'credit-card',
  },
  {
    role: 'Inventory Clerk',
    description:
      'Look up products, receive stock, manage transfers, adjustments, and low-stock actions.',
    outcome: 'Protect stock accuracy before jobs, purchases, and transfers collide.',
    icon: 'box',
  },
];

export const trustItems: readonly TrustItem[] = [
  {
    title: 'Tenant and branch aware',
    description:
      'Records and navigation are designed around tenant, branch, role, and permission context.',
    icon: 'shield',
  },
  {
    title: 'Ledger-first inventory',
    description:
      'Stock-changing workflows are designed around inventory ledger entries, reservations, and FIFO layers.',
    icon: 'box',
  },
  {
    title: 'Financial records stay controlled',
    description:
      'Invoices, payments, receipts, refunds, and related histories use controlled workflows instead of casual edits.',
    icon: 'receipt',
  },
  {
    title: 'Read-only offline safety',
    description:
      'The PWA can keep recent information readable offline without allowing risky offline operational writes.',
    icon: 'offline',
  },
];

export const operationalProofPoints: readonly ProofPoint[] = [
  {
    value: 'Branch',
    label: 'context stays visible where work is branch-scoped',
  },
  {
    value: 'Role',
    label: 'navigation follows the user’s operational responsibilities',
  },
  {
    value: 'Audit',
    label: 'critical workflow history keeps actor and timing context visible',
  },
];
