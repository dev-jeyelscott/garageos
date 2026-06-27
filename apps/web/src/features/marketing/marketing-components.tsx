import { Badge, ButtonLink, Card, Container, cn } from '../../components/ui';

const capabilities = [
  {
    title: 'Customer and motorcycle records',
    description:
      'Centralize customer profiles, motorcycle details, and branch-filtered service history for authorized users.',
  },
  {
    title: 'Job orders and service work',
    description:
      'Support structured repair intake, mechanic assignment, labor tracking, parts usage, and service status visibility.',
  },
  {
    title: 'Inventory and branch stock',
    description:
      'Track products, branch stock, reservations, transfers, adjustments, and low-stock visibility with ledger discipline.',
  },
  {
    title: 'FIFO-aware operations',
    description:
      'Model inventory around ledger entries, FIFO cost layers, and reservation allocation instead of direct quantity edits.',
  },
  {
    title: 'Invoices, payments, and receipts',
    description:
      'Record service invoices, partial or split payments, immutable receipts, refunds, AR, and AP workflows.',
  },
  {
    title: 'Reports and reminders',
    description:
      'Give owners and managers visibility through dashboards, operational reports, customer reminders, and notifications.',
  },
];

const roleValues = [
  [
    'Owner / Manager',
    'Monitor dashboards, reports, subscriptions, employees, roles, branches, exports, and audit visibility.',
  ],
  [
    'Service Advisor',
    'Move quickly through customer lookup, motorcycle intake, estimates, job orders, notes, and service history.',
  ],
  [
    'Mechanic',
    'Focus on assigned jobs, work sessions, repair notes, labor tasks, and service progress without financial clutter.',
  ],
  [
    'Cashier',
    'Work from invoices, payments, receipts, refunds where permitted, and accounts receivable visibility.',
  ],
  [
    'Inventory Clerk',
    'Handle product lookup, receiving, stock checks, transfers, adjustments, suppliers, and low-stock alerts.',
  ],
];

const workflowSteps = [
  'Intake',
  'Service work',
  'Parts reservation',
  'Invoice',
  'Payment',
  'Reports',
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <Container className="flex min-h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 font-bold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            G
          </span>
          <span>GarageOS</span>
        </a>

        <nav
          aria-label="Primary marketing navigation"
          className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
        >
          <a href="#capabilities" className="hover:text-foreground">
            Capabilities
          </a>
          <a href="#workflow" className="hover:text-foreground">
            Workflow
          </a>
          <a href="#roles" className="hover:text-foreground">
            Roles
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/auth/login" variant="ghost" size="sm">
            Login
          </ButtonLink>
          <ButtonLink href="/auth/signup-owner" size="sm">
            Owner signup
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}

export function MarketingHero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border bg-background py-16 sm:py-20 lg:py-24"
    >
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgb(var(--accent))_0,transparent_60%)]" />

      <Container className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <Badge className="mb-6 border-primary/30 bg-accent text-accent-foreground">
            Mobile-first SaaS for motorcycle service operations
          </Badge>

          <h1 className="max-w-4xl text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Run motorcycle shop operations from intake to invoice with one focused system.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            GarageOS centralizes customers, motorcycles, job orders, inventory, purchasing,
            invoicing, payments, reminders, reports, and tenant subscription access for motorcycle
            repair shops, tuning shops, tire shops, accessories shops, and service centers.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/auth/signup-owner" size="lg">
              Start owner signup
            </ButtonLink>
            <ButtonLink href="/auth/login" variant="secondary" size="lg">
              Login to GarageOS
            </ButtonLink>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Owner signup follows the documented pending-setup and email-verification flow before
            operational access.
          </p>
        </div>

        <Card className="p-4 shadow-xl sm:p-6">
          <div className="rounded-2xl border border-border bg-muted p-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Today&apos;s shop view
                </p>
                <h2 className="text-2xl font-black">Service dashboard</h2>
              </div>
              <Badge className="bg-card">Branch-aware</Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Open job orders" value="24" />
              <MetricCard label="Low-stock alerts" value="8" />
              <MetricCard label="Receivables" value="AR" />
              <MetricCard label="Pending reminders" value="Due" />
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Structured workflow</p>
              <div className="mt-4 grid gap-2">
                {workflowSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {index + 1}
                    </span>
                    <span className="text-sm text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </Container>
    </section>
  );
}

export function FeatureGrid() {
  return (
    <section id="capabilities" className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Documented capabilities"
          title="Built around the daily flow of motorcycle service businesses."
          description="The landing page only presents capabilities already documented in the GarageOS source requirements."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <Card key={capability.title} className="p-6">
              <h3 className="text-lg font-bold">{capability.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {capability.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function WorkflowPreview() {
  return (
    <section id="workflow" className="border-y border-border bg-muted py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Operational flow"
          title="One connected service workflow, without unsupported scope."
          description="GarageOS focuses on documented service operations, inventory discipline, billing records, reminders, reports, and read-only offline access."
        />

        <div className="mt-10 grid gap-3 lg:grid-cols-6">
          {workflowSteps.map((step, index) => (
            <Card
              key={step}
              className={cn(
                'p-5',
                index === 0 && 'border-primary/40 bg-accent text-accent-foreground',
              )}
            >
              <p className="text-3xl font-black">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="mt-4 font-bold">{step}</h3>
            </Card>
          ))}
        </div>

        <Card className="mt-6 border-readonly/40 p-6">
          <h3 className="font-bold">Offline mode is intentionally read-only.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The documented PWA offline behavior supports an app shell and recently viewed records,
            but does not allow offline creation, editing, approval, payment, upload, or sync queues.
          </p>
        </Card>
      </Container>
    </section>
  );
}

export function RoleValueSection() {
  return (
    <section id="roles" className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Role-aware operations"
          title="Designed for owners, advisors, mechanics, cashiers, and inventory teams."
          description="GarageOS navigation and actions should remain permission-aware, branch-aware, tenant-status-aware, and backend-authoritative."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-5">
          {roleValues.map(([role, description]) => (
            <Card key={role} className="p-5">
              <h3 className="font-bold">{role}</h3>
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
    <section className="bg-card py-16 sm:py-20">
      <Container>
        <div className="grid gap-6 lg:grid-cols-3">
          <TrustCard
            title="Tenant and branch aware"
            description="Tenant context, branch access, permissions, plan limits, and subscription states are part of the documented UI and API contract."
          />
          <TrustCard
            title="Ledger-first inventory language"
            description="The UI describes inventory discipline at a high level without pretending stock can be directly edited outside documented workflows."
          />
          <TrustCard
            title="Focused SaaS scope"
            description="GarageOS does not market customer portals, standalone POS checkout, payroll, full accounting, automatic subscription charging, native apps, or 2FA."
          />
        </div>
      </Container>
    </section>
  );
}

export function MarketingCtaSection() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Card className="overflow-hidden border-primary/30 bg-accent p-8 text-accent-foreground sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em]">GarageOS</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Give your motorcycle shop a cleaner operating system.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6">
                Start with the documented owner signup flow or log in to continue existing GarageOS
                account work.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink href="/auth/signup-owner" size="lg">
                Owner signup
              </ButtonLink>
              <ButtonLink href="/auth/login" variant="secondary" size="lg">
                Login
              </ButtonLink>
            </div>
          </div>
        </Card>
      </Container>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border py-8">
      <Container className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>GarageOS — Motorcycle Shop Management System SaaS</p>
        <div className="flex gap-4">
          <a href="#capabilities" className="hover:text-foreground">
            Capabilities
          </a>
          <a href="/auth/login" className="hover:text-foreground">
            Login
          </a>
        </div>
      </Container>
    </footer>
  );
}

function MetricCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
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
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
    </div>
  );
}

function TrustCard({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </Card>
  );
}
