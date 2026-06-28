import Image from 'next/image';

import { Badge, ButtonLink, Card, Container, cn } from '../../components/ui';

type IconName =
  | 'audit'
  | 'bell'
  | 'box'
  | 'chart'
  | 'checklist'
  | 'offline'
  | 'receipt'
  | 'roles'
  | 'shield'
  | 'shop'
  | 'users'
  | 'wrench';

type Feature = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
};

type Metric = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: IconName;
  readonly positive?: boolean;
};

type TrustItem = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
};

const navItems = [
  ['Features', '#features'],
  ['Workflow', '#workflow'],
  ['Roles', '#roles'],
  ['Trust', '#trust'],
] as const;

const dashboardMetrics: readonly Metric[] = [
  { label: "Today's Job Orders", value: '24', detail: '6 in progress', icon: 'wrench' },
  { label: 'Active Mechanics', value: '8', detail: '2 on break', icon: 'users' },
  { label: 'Low Stock Alerts', value: '12', detail: 'Reorder soon', icon: 'box' },
  { label: 'Unpaid Invoices', value: 'PHP 48,500', detail: '6 invoices', icon: 'receipt' },
  { label: 'Service Reminders', value: '36', detail: 'This week', icon: 'bell' },
  {
    label: 'Branch Performance',
    value: '+18%',
    detail: 'vs last month',
    icon: 'chart',
    positive: true,
  },
];

const features: readonly Feature[] = [
  {
    title: 'Job Order Tracking',
    description: 'Create, assign, and track job orders from intake to release.',
    icon: 'wrench',
  },
  {
    title: 'Motorcycle Service History',
    description: 'Complete service history and documents per motorcycle.',
    icon: 'shop',
  },
  {
    title: 'Inventory & FIFO',
    description: 'Real-time stock, FIFO costing, transfers, adjustments, and low-stock alerts.',
    icon: 'box',
  },
  {
    title: 'Estimates & Approvals',
    description: 'Create estimates, get approvals, and convert approved work to job orders.',
    icon: 'checklist',
  },
  {
    title: 'Invoices & Payments',
    description: 'Generate invoices, record payments, print receipts, and handle refunds.',
    icon: 'receipt',
  },
  {
    title: 'Reports & Reminders',
    description: 'Operational reports, customer reminders, and branch-aware shop visibility.',
    icon: 'chart',
  },
];

const trustItems: readonly TrustItem[] = [
  {
    title: 'Multi-Branch Ready',
    description: 'Manage multiple branches with role-based branch access and consolidated reports.',
    icon: 'shop',
  },
  {
    title: 'Role-Aware Workflows',
    description:
      'Owners, managers, advisors, mechanics, cashiers, and inventory clerks see the right actions.',
    icon: 'roles',
  },
  {
    title: 'Read-Only Offline Visibility',
    description: 'Keep viewing recent records while offline without allowing offline writes.',
    icon: 'offline',
  },
  {
    title: 'Audit-Friendly Operations',
    description:
      'Critical workflow changes keep status history, actors, timestamps, and reasons visible.',
    icon: 'audit',
  },
  {
    title: 'Secure & Reliable',
    description:
      'Tenant isolation, branch access, permissions, and protected operational records stay enforced.',
    icon: 'shield',
  },
];

const roleValues = [
  ['Owner / Manager', 'Dashboards, branches, employees, reports, exports, and audit visibility.'],
  [
    'Service Advisor',
    'Customer lookup, motorcycle intake, estimates, job orders, notes, and history.',
  ],
  ['Mechanic', 'Assigned jobs, work sessions, repair notes, labor tasks, and service progress.'],
  ['Cashier', 'Invoices, payments, receipts, refunds, and receivables where permitted.'],
  [
    'Inventory Clerk',
    'Product lookup, receiving, stock checks, transfers, adjustments, and low stock.',
  ],
] as const;

const workflowSteps = [
  'Intake',
  'Estimate',
  'Approval',
  'Parts reservation',
  'Service work',
  'Invoice',
  'Payment',
  'Reports',
] as const;

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 shadow-[0_1px_0_rgb(255_255_255_/_0.75)] backdrop-blur-xl">
      <Container className="flex min-h-20 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 font-black tracking-tight">
          <Image
            src="/images/logo.png"
            alt="GarageOS"
            width={246}
            height={64}
            priority
            className="h-11 w-auto"
          />
          <Image
            src="/images/garageos.png"
            alt="GarageOS"
            width={246}
            height={64}
            priority
            className="h-11 w-auto"
          />
        </a>

        <nav
          aria-label="Primary marketing navigation"
          className="hidden items-center gap-8 text-sm font-semibold text-muted-foreground lg:flex"
        >
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink
            href="/auth/login"
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Log in
          </ButtonLink>
          <ButtonLink
            href="/auth/signup-owner"
            size="sm"
            className="bg-gradient-to-r from-primary to-orange-500 px-4 shadow-[0_14px_30px_rgb(249_115_0_/_0.28)] hover:opacity-95"
          >
            Start Managing Your Garage
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}

export function MarketingHero() {
  return (
    <section id="top" className="relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255)_0%,rgb(var(--background))_58%,rgb(var(--muted))_100%)]" />
      <div className="absolute right-0 top-24 hidden h-96 w-[38rem] -translate-y-6 rounded-l-full bg-[linear-gradient(135deg,rgb(255_244_230),rgb(255_255_255)_42%,rgb(249_115_0_/_0.18))] lg:block" />
      <div className="absolute right-0 top-28 hidden h-56 w-72 border-y-[12px] border-primary/20 lg:block" />

      <Container className="relative grid gap-12 pb-10 pt-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:pb-8 lg:pt-10 xl:gap-14">
        <div className="max-w-2xl">
          <Badge className="mb-6 border-primary/20 bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm">
            <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            Built for motorcycle shops and service centers
          </Badge>

          <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Run Your Shop{' '}
            <span className="block bg-gradient-to-br from-primary via-orange-400 to-amber-300 bg-clip-text text-transparent">
              Smarter
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
            GarageOS centralizes customers, motorcycles, job orders, inventory, invoices, payments,
            reminders, and reports so motorcycle shops can focus on better service.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/auth/signup-owner"
              size="lg"
              className="bg-gradient-to-r from-primary to-orange-500 px-6 shadow-[0_18px_35px_rgb(249_115_0_/_0.32)] hover:opacity-95"
            >
              Start Managing Your Garage
              <span aria-hidden="true" className="ml-2">
                &gt;
              </span>
            </ButtonLink>
            <ButtonLink href="#features" variant="outline" size="lg" className="gap-2 bg-card">
              <span aria-hidden="true" className="text-primary">
                ▶
              </span>
              Explore Features
            </ButtonLink>
          </div>

          <div className="mt-9 flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
            <div className="flex -space-x-3" aria-hidden="true">
              {['MS', 'AR', 'JD', 'LV', 'KO'].map((initials, index) => (
                <span
                  key={initials}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-black text-foreground shadow-sm',
                    index % 2 === 0 && 'bg-accent text-accent-foreground',
                  )}
                >
                  {initials}
                </span>
              ))}
            </div>
            <p className="max-w-sm">
              Trusted by shop owners and service teams for branch-aware work, inventory discipline,
              and cleaner customer service.
            </p>
          </div>
        </div>

        <DashboardMockup />
      </Container>
    </section>
  );
}

export function FeatureGrid() {
  return (
    <section id="features" className="relative bg-background py-10 sm:py-14">
      <Container>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group rounded-2xl p-6 text-center shadow-[0_18px_60px_rgb(24_24_27_/_0.06)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_24px_70px_rgb(249_115_0_/_0.12)] xl:p-5"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
                <MarketingIcon name={feature.icon} className="h-7 w-7" />
              </span>
              <h2 className="mt-5 text-base font-black tracking-tight">{feature.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function WorkflowPreview() {
  return (
    <section id="workflow" className="bg-background py-14 sm:py-18">
      <Container>
        <SectionHeading
          eyebrow="Connected workflow"
          title="From intake to reports without leaving documented GarageOS scope."
          description="Job orders, estimates, parts reservations, invoices, payments, reminders, and reports are presented as explicit operational steps, with offline writes intentionally blocked."
        />

        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <Card
              key={step}
              className={cn(
                'rounded-2xl p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]',
                index === 0 && 'border-primary/40 bg-accent',
              )}
            >
              <p className="text-3xl font-black text-primary">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-4 font-black">{step}</h3>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function RoleValueSection() {
  return (
    <section id="roles" className="border-y border-border/80 bg-muted py-14 sm:py-18">
      <Container>
        <SectionHeading
          eyebrow="Role-aware operations"
          title="Designed for the people who keep a motorcycle shop moving."
          description="GarageOS keeps navigation and actions permission-aware, branch-aware, tenant-status-aware, and backend-authoritative."
        />

        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {roleValues.map(([role, description]) => (
            <Card key={role} className="rounded-2xl p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]">
              <h3 className="font-black">{role}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function OperationalTrustSection() {
  return (
    <section id="trust" className="bg-background py-10 sm:py-12">
      <Container>
        <Card className="grid overflow-hidden rounded-2xl shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] lg:grid-cols-[1.35fr_repeat(5,1fr)]">
          <div className="flex items-center gap-4 bg-gradient-to-br from-primary to-orange-500 p-6 text-primary-foreground lg:p-7">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15">
              <MarketingIcon name="shield" className="h-9 w-9" />
            </span>
            <div>
              <h2 className="text-xl font-black">Built for Modern Motorcycle Shops</h2>
              <p className="mt-2 text-sm leading-6 text-white/90">
                Operational SaaS for service teams, inventory, billing, and branch visibility.
              </p>
            </div>
          </div>

          {trustItems.map((item) => (
            <div
              key={item.title}
              className="border-t border-border/80 p-5 lg:border-l lg:border-t-0 lg:p-6"
            >
              <MarketingIcon name={item.icon} className="h-7 w-7 text-muted-foreground" />
              <h3 className="mt-4 text-sm font-black">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </Card>
      </Container>
    </section>
  );
}

export function MarketingCtaSection() {
  return (
    <section className="bg-background pb-16 pt-8 sm:pb-20">
      <Container>
        <p className="mx-auto max-w-4xl text-center text-base leading-7 text-muted-foreground">
          GarageOS is the all-in-one shop management system that helps motorcycle service businesses
          deliver better service and grow with cleaner operations.
        </p>
      </Container>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card py-7">
      <Container className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>GarageOS - Motorcycle Shop Management System SaaS</p>
        <div className="flex gap-5">
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-foreground">
              {label}
            </a>
          ))}
        </div>
      </Container>
    </footer>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div className="absolute -inset-3 rounded-[2rem] bg-[linear-gradient(135deg,rgb(24_24_27_/_0.16),transparent_35%,rgb(249_115_0_/_0.16))] blur-xl" />
      <Card className="relative overflow-hidden rounded-[1.6rem] border-zinc-700/40 bg-card shadow-[0_28px_90px_rgb(24_24_27_/_0.22)]">
        <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[170px_1fr]">
          <aside className="hidden border-r border-border bg-background/85 p-4 md:block">
            <div className="flex items-center gap-2">
              <Image
                src="/images/favicon-32x32.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="font-black tracking-tight">
                Garage<span className="text-primary">OS</span>
              </span>
            </div>
            <nav
              aria-label="Demo dashboard navigation"
              className="mt-6 grid gap-1 text-xs font-semibold"
            >
              {[
                'Dashboard',
                'Job Orders',
                'Customers',
                'Motorcycles',
                'Inventory',
                'Invoices',
                'Payments',
                'Reports',
                'Reminders',
                'Settings',
              ].map((item, index) => (
                <span
                  key={item}
                  className={cn(
                    'rounded-xl px-3 py-2 text-muted-foreground',
                    index === 0 && 'bg-accent text-primary',
                  )}
                >
                  {item}
                </span>
              ))}
            </nav>
            <div className="mt-12 rounded-xl border border-border bg-card p-3 text-xs">
              <p className="font-bold">Main Branch</p>
              <p className="mt-1 text-primary">All branches view</p>
            </div>
          </aside>

          <div className="bg-muted/35 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Sample dashboard
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">Good morning, Miguel!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Here is what is happening in your shop today.
                </p>
              </div>
              <div className="flex gap-2 text-xs font-semibold">
                <span className="rounded-xl border border-border bg-card px-3 py-2">
                  Main Branch
                </span>
                <span className="rounded-xl border border-border bg-card px-3 py-2">
                  Miguel Santos
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {dashboardMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr_1fr]">
              <PreviewPanel title="Recent Job Orders" action="View all">
                {[
                  ['JO-2034-0012S', 'Yamaha NMAX 155', 'In Progress'],
                  ['JO-2034-0014A', 'Honda Click 125i', 'Waiting for Parts'],
                  ['JO-2034-0012S', 'Kawasaki Ninja 400', 'Completed'],
                  ['JO-2034-0012Z', 'Honda ADV 160', 'Pending'],
                ].map(([code, bike, status]) => (
                  <div
                    key={`${code}-${bike}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold">{code}</p>
                      <p className="text-muted-foreground">{bike}</p>
                    </div>
                    <span className="rounded-full bg-accent px-2 py-1 font-bold text-accent-foreground">
                      {status}
                    </span>
                  </div>
                ))}
              </PreviewPanel>

              <PreviewPanel title="Low Stock Items" action="View all">
                {[
                  ['Motor Oil 10W-40', '3 pcs'],
                  ['Brake Pad (Front)', '2 sets'],
                  ['Spark Plug', '1 pcs'],
                  ['Drive Belt', '2 pcs'],
                ].map(([item, count]) => (
                  <div key={item} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary">
                        <MarketingIcon name="box" className="h-4 w-4" />
                      </span>
                      <p className="font-bold">{item}</p>
                    </div>
                    <p className="font-black text-primary">{count}</p>
                  </div>
                ))}
              </PreviewPanel>

              <PreviewPanel title="Sales Overview" action="This month">
                <p className="text-2xl font-black">PHP 186,750</p>
                <p className="mt-1 text-xs font-bold text-success">+16% vs last month</p>
                <div className="mt-5 flex h-28 items-end gap-2 border-b border-l border-border px-2">
                  {[34, 52, 48, 72, 68, 91, 84, 105, 96, 118, 104, 126].map((height, index) => (
                    <span
                      key={`${height}-${index}`}
                      className="flex-1 rounded-t-lg bg-gradient-to-t from-primary/25 to-primary"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </PreviewPanel>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ metric }: { readonly metric: Metric }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_36px_rgb(24_24_27_/_0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground">{metric.label}</p>
          <p className={cn('mt-2 text-2xl font-black', metric.positive && 'text-success')}>
            {metric.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <MarketingIcon name={metric.icon} className="h-6 w-6" />
        </span>
      </div>
      <div className="mt-4 flex h-5 items-end justify-end gap-1">
        {[18, 22, 19, 27, 25, 34, 31, 39].map((height, index) => (
          <span
            key={`${metric.label}-${index}`}
            className="w-5 rounded-t-full bg-primary/70"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewPanel({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_36px_rgb(24_24_27_/_0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black">{title}</h3>
        <span className="text-xs font-semibold text-muted-foreground">{action}</span>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
    </div>
  );
}

function MarketingIcon({
  name,
  className,
}: {
  readonly name: IconName;
  readonly className?: string;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    audit: (
      <>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    bell: (
      <>
        <path d="M18 16H6l2-3V9a4 4 0 0 1 8 0v4z" />
        <path d="M10 19h4" />
      </>
    ),
    box: (
      <>
        <path d="M4 8l8-4 8 4-8 4z" />
        <path d="M4 8v8l8 4 8-4V8" />
        <path d="M12 12v8" />
      </>
    ),
    chart: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </>
    ),
    checklist: (
      <>
        <path d="M8 6h11M8 12h11M8 18h11" />
        <path d="M4.5 6l1 1 1.5-2M4.5 12l1 1 1.5-2M4.5 18l1 1 1.5-2" />
      </>
    ),
    offline: (
      <>
        <path d="M4 12a12 12 0 0 1 16 0" />
        <path d="M7 15a7 7 0 0 1 10 0" />
        <path d="M10 18a3 3 0 0 1 4 0" />
        <path d="M4 4l16 16" />
      </>
    ),
    receipt: (
      <>
        <path d="M7 4h10v16l-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    roles: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M17 8a2.5 2.5 0 0 1 0 5" />
        <path d="M16 16a5 5 0 0 1 5 4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10h16l-2-5H6z" />
        <path d="M6 10v9h12v-9" />
        <path d="M9 19v-5h6v5" />
      </>
    ),
    users: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 7a3 3 0 0 1 0 6" />
        <path d="M17 14a6 6 0 0 1 4 6" />
      </>
    ),
    wrench: (
      <>
        <path d="M14 7a5 5 0 0 0 6 6L11 22l-5-5 9-9z" />
        <path d="M7 17l-4-4 4-4" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
