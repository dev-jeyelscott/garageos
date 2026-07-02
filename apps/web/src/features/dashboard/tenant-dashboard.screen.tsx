'use client';

import { useEffect, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  type BadgeVariant,
} from '../../components/ui';
import { isApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData, AuthTenantStatus } from '../auth/types/auth-session';

type TenantDashboardState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

export function TenantDashboardScreen() {
  const [state, setState] = useState<TenantDashboardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (!active) {
          return;
        }

        setState({
          status: 'ready',
          session,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load tenant dashboard.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <TenantDashboardSkeleton />;
  }

  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{state.message}</p>
        {state.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.detail}</p>
        )}
      </Alert>
    );
  }

  return <TenantDashboardContent session={state.session} />;
}

function TenantDashboardContent({ session }: { readonly session: AuthSessionResponseData }) {
  const warnings = session.subscription?.warnings ?? [];
  const tenantStatus = session.tenant?.status;
  const planName = session.effective_plan?.name ?? 'Plan not returned';
  const expirationDate = session.subscription?.expiration_date ?? 'N/A';

  return (
    <>
      <Card>
        <CardHeader className="gap-4 xl:grid xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Tenant Workspace
            </p>
            <CardTitle className="mt-2 text-3xl sm:text-4xl">Dashboard</CardTitle>
            <CardDescription className="mt-3 max-w-5xl text-sm leading-6 sm:text-base sm:leading-7">
              Source-aligned tenant workspace overview. Operational dashboard metrics stay
              placeholder-only until the documented dashboard and report APIs are wired.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/customers" variant="secondary">
              Customers
            </ButtonLink>
            <ButtonLink href="/job-orders" variant="primary">
              Job orders
            </ButtonLink>
          </div>
        </CardHeader>
      </Card>

      {warnings.length > 0 ? (
        <Alert>
          <p className="text-sm font-bold">Subscription warning</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {warnings.map((warning) => (
              <li key={warning.code}>
                <strong>{warning.code}:</strong> {warning.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Tenant status"
          value={formatTenantStatus(tenantStatus)}
          description="Tenant lifecycle is resolved from the authenticated session."
        />
        <SummaryCard
          title="Access mode"
          value={session.access.read_only ? 'Read-only' : 'Writable when permitted'}
          description={
            session.access.can_access_operational_modules
              ? 'Operational modules are available by permission and branch access.'
              : 'Operational modules are blocked by tenant or session state.'
          }
        />
        <SummaryCard
          title="Plan"
          value={planName}
          description={`Subscription expiration: ${expirationDate}`}
        />
        <SummaryCard
          title="Permissions"
          value={String(session.effective_permissions.length)}
          description="Permission-aware UI is a UX aid; backend authorization remains authoritative."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <TenantAccessHealthCard session={session} />
        <TenantDashboardReadinessCard session={session} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
        <TenantQuickActionsCard session={session} />
        <BranchAccessCard session={session} />
        <DashboardApiPolicyCard />
      </div>
    </>
  );
}

function TenantDashboardSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-live="polite">
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function TenantAccessHealthCard({ session }: { readonly session: AuthSessionResponseData }) {
  const rows: readonly {
    readonly label: string;
    readonly value: string;
    readonly status: string;
    readonly description: string;
  }[] = [
    {
      label: 'Lifecycle',
      value: formatTenantStatus(session.tenant?.status),
      status: session.tenant?.status ?? 'unknown',
      description: 'Controls whether operational modules can be accessed.',
    },
    {
      label: 'Subscription',
      value: formatTenantStatus(session.subscription?.status),
      status: session.subscription?.status ?? 'unknown',
      description: 'Returned subscription state from the authenticated session.',
    },
    {
      label: 'Operational access',
      value: session.access.can_access_operational_modules ? 'Available' : 'Blocked',
      status: session.access.can_access_operational_modules ? 'active' : 'read_only',
      description: 'Still subject to permission, branch, and backend validation.',
    },
    {
      label: 'Read-only mode',
      value: session.access.read_only ? 'Enabled' : 'Disabled',
      status: session.access.read_only ? 'read_only' : 'active',
      description: 'When enabled, operational writes must stay blocked.',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access health</CardTitle>
        <CardDescription>Session-derived lifecycle and access indicators.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status} />
                  <span className="text-sm font-bold text-foreground">{row.label}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.description}</p>
              </div>
              <p className="text-left text-lg font-black text-foreground sm:text-right">
                {row.value}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TenantDashboardReadinessCard({ session }: { readonly session: AuthSessionResponseData }) {
  const dashboardWidgets = [
    'Daily sales',
    'Monthly revenue',
    'Pending jobs',
    'Jobs by status',
    'Inventory alerts',
    'Revenue chart',
    'Customer growth',
    'Accounts receivable summary',
    'Accounts payable summary',
    'Low stock summary',
    'Open transfer summary',
    'Pending purchase receiving summary',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard readiness</CardTitle>
        <CardDescription>
          Documented dashboard widgets remain inactive until dashboard/report APIs are available.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <p className="text-sm leading-6 text-muted-foreground">
            This screen intentionally avoids synthetic operational metrics. Wire real widgets only
            through the documented dashboard/report read APIs and branch-scoped access rules.
          </p>
        </Alert>

        <div className="grid gap-3 md:grid-cols-2">
          {dashboardWidgets.map((widget) => (
            <ChecklistItem key={widget} label={widget} />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">Branch basis:</strong>{' '}
          {session.tenant_wide_branch_access
            ? 'Tenant-wide branch access.'
            : 'Assigned branch visibility only.'}
        </div>
      </CardContent>
    </Card>
  );
}

function TenantQuickActionsCard({ session }: { readonly session: AuthSessionResponseData }) {
  const actions = [
    {
      title: 'Job orders',
      description: 'Open service workflow routes.',
      href: '/job-orders',
      enabled:
        session.access.can_access_operational_modules &&
        hasAnyPermission(session, ['job_orders.read']),
      disabledReason: 'Requires job_orders.read and operational access.',
      primary: true,
    },
    {
      title: 'Customers',
      description: 'Search tenant-wide customer records.',
      href: '/customers',
      enabled: hasAnyPermission(session, ['customers.read']),
      disabledReason: 'Requires customers.read.',
      primary: false,
    },
    {
      title: 'Inventory',
      description: 'Open stock-balance lookup.',
      href: '/inventory/stock-balances',
      enabled: hasAnyPermission(session, ['inventory.read']),
      disabledReason: 'Requires inventory.read.',
      primary: false,
    },
    {
      title: 'Suppliers',
      description: 'Open supplier records.',
      href: '/suppliers',
      enabled: hasAnyPermission(session, ['suppliers.read']),
      disabledReason: 'Requires suppliers.read.',
      primary: false,
    },
    {
      title: 'Accounts payable',
      description: 'Review supplier balances where allowed.',
      href: '/accounts-payable',
      enabled: hasAnyPermission(session, ['supplier_payments.read', 'reports.view_basic']),
      disabledReason: 'Requires supplier_payments.read or reports.view_basic.',
      primary: false,
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Only documented tenant destinations are shown.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {actions.map((action) => (
            <li key={action.title}>
              {action.enabled ? (
                <ButtonLink
                  href={action.href}
                  variant={action.primary ? 'primary' : 'secondary'}
                  className="w-full justify-start"
                >
                  <span className="grid gap-1 text-left">
                    <span>{action.title}</span>
                    <span className="text-xs font-medium opacity-80">{action.description}</span>
                  </span>
                </ButtonLink>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  disabled
                  title={action.disabledReason}
                >
                  <span className="grid gap-1 text-left">
                    <span>{action.title}</span>
                    <span className="text-xs font-medium opacity-80">{action.disabledReason}</span>
                  </span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BranchAccessCard({ session }: { readonly session: AuthSessionResponseData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branch access</CardTitle>
        <CardDescription>Branch visibility from the authenticated session.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-2xl font-black text-foreground">
            {session.tenant_wide_branch_access ? 'Tenant-wide' : String(session.branches.length)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {session.tenant_wide_branch_access
              ? 'This session can view branch-scoped data across assigned tenant context.'
              : 'Assigned branch count returned by the session.'}
          </p>
        </div>

        {session.branches.length === 0 ? (
          <EmptyState
            title="No branch assignments"
            description="Branch-scoped operational records should remain unavailable until branch access is assigned or tenant-wide access is granted."
          />
        ) : (
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {session.branches.map((branch) => (
              <li key={branch.id} className="rounded-2xl border border-border bg-muted/40 p-3">
                {branch.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardApiPolicyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard API policy</CardTitle>
        <CardDescription>Prevents invented operational metrics.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <p className="text-sm leading-6 text-muted-foreground">
            Dashboard widgets must be wired only to documented dashboard/report APIs. Empty,
            loading, forbidden, branch-scoped, plan-blocked, read-only, and offline states must be
            handled per the UI registry.
          </p>
        </Alert>

        <ul className="grid gap-3 text-sm text-muted-foreground">
          <ChecklistItem label="Do not render fake sales, revenue, inventory, AR, or AP metrics." />
          <ChecklistItem label="Apply branch filters for multi-branch users." />
          <ChecklistItem label="Keep write actions disabled under read-only or offline mode." />
        </ul>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  readonly title: string;
  readonly value: string;
  readonly description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { readonly status: string }) {
  return <Badge variant={getStatusBadgeVariant(status)}>{formatStatusLabel(status)}</Badge>;
}

function getStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active':
    case 'available':
      return 'success';

    case 'pending_setup':
    case 'grace_period':
      return 'warning';

    case 'read_only':
    case 'blocked':
      return 'readonly';

    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
      return 'destructive';

    default:
      return 'secondary';
  }
}

function ChecklistItem({ label }: { readonly label: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-black text-muted-foreground"
      >
        •
      </span>
      <span className="text-sm leading-6 text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
      <h2 className="font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function hasAnyPermission(
  session: AuthSessionResponseData,
  permissions: readonly string[],
): boolean {
  return permissions.some((permission) => session.effective_permissions.includes(permission));
}

function formatTenantStatus(status: AuthTenantStatus | undefined): string {
  return status === undefined ? 'Unknown' : formatStatusLabel(status);
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  return fallback;
}

function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const referenceParts = [
    error.requestId === null ? null : `request_id: ${error.requestId}`,
    error.correlationId === null ? null : `correlation_id: ${error.correlationId}`,
  ].filter((part): part is string => part !== null);

  if (referenceParts.length === 0) {
    return null;
  }

  return referenceParts.join(' · ');
}
