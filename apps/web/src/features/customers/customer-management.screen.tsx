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
  Input,
  Skeleton,
  type BadgeVariant,
} from '../../components/ui';
import { isApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData, AuthTenantStatus } from '../auth/types/auth-session';

type CustomerManagementState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

export function CustomerManagementScreen() {
  const [state, setState] = useState<CustomerManagementState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (!active) {
          return;
        }

        setState({ status: 'ready', session });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load customer management.'),
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
    return <CustomerManagementSkeleton />;
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

  return <CustomerManagementContent session={state.session} />;
}

function CustomerManagementContent({ session }: { readonly session: AuthSessionResponseData }) {
  const canReadCustomers = hasPermission(session, 'customers.read');
  const canCreateCustomers =
    hasPermission(session, 'customers.create') &&
    session.access.can_access_operational_modules &&
    !session.access.read_only;
  const operationalWritesBlocked =
    !session.access.can_access_operational_modules || session.access.read_only;

  return (
    <>
      <Card>
        <CardHeader className="gap-4 xl:grid xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Customer Records
            </p>
            <CardTitle className="mt-2 text-3xl sm:text-4xl">Customers</CardTitle>
            <CardDescription className="mt-3 max-w-5xl text-sm leading-6 sm:text-base sm:leading-7">
              Tenant-wide customer management workspace for lookup, intake, customer profile
              maintenance, motorcycle links, branch-filtered history, notes, files, and audit-aware
              future workflows.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/dashboard" variant="secondary">
              Dashboard
            </ButtonLink>
            {canCreateCustomers ? (
              <Button disabled title="Customer creation route is not wired in this slice.">
                Add customer
              </Button>
            ) : (
              <Button
                disabled
                title="Requires customers.create, operational write access, and online mode."
                variant="secondary"
              >
                Add customer
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {!canReadCustomers ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Customer management unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your tenant session does not include permission to view customer records.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Required permission: <strong>customers.read</strong>
          </p>
        </Alert>
      ) : null}

      {operationalWritesBlocked && canReadCustomers ? (
        <Alert>
          <p className="text-sm font-bold">Read-oriented customer workspace</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Operational create, edit, merge, soft-delete, restore, file upload, and note actions
            stay blocked while tenant access is read-only, setup-blocked, suspended, or otherwise
            not write-capable.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Directory"
          value={canReadCustomers ? 'Available' : 'Blocked'}
          status={canReadCustomers ? 'active' : 'forbidden'}
          description="Customer list/search visibility follows customers.read."
        />
        <SummaryCard
          title="Customer intake"
          value={canCreateCustomers ? 'Ready for route' : 'Disabled'}
          status={canCreateCustomers ? 'active' : 'read_only'}
          description="Create flow remains disabled until the verified API/page slice is wired."
        />
        <SummaryCard
          title="Branch history"
          value={session.tenant_wide_branch_access ? 'Tenant-wide' : 'Filtered'}
          status="info"
          description="Customer profile is tenant-wide; operational history remains branch-scoped."
        />
        <SummaryCard
          title="Tenant status"
          value={formatTenantStatus(session.tenant?.status)}
          status={session.tenant?.status ?? 'unknown'}
          description="Tenant lifecycle gates still override UI permissions."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <CustomerSearchFoundationCard canReadCustomers={canReadCustomers} />
        <CustomerWorkflowCoverageCard />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <CustomerQuickActionsCard session={session} />
        <CustomerAccessPolicyCard session={session} />
        <CustomerApiPolicyCard />
      </div>
    </>
  );
}

function CustomerManagementSkeleton() {
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

function CustomerSearchFoundationCard({
  canReadCustomers,
}: {
  readonly canReadCustomers: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer lookup</CardTitle>
        <CardDescription>
          Mobile-first search foundation for tenant-wide customer records.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            <span>Search customers</span>
            <Input
              disabled
              placeholder="Name, mobile number, email, plate, or motorcycle"
              title="Customer search API client is not wired in this slice."
            />
          </label>
          <div className="flex items-end">
            <Button disabled className="w-full md:w-auto" variant="secondary">
              Search
            </Button>
          </div>
        </div>

        {canReadCustomers ? (
          <EmptyState
            title="Customer list API pending"
            description="No synthetic customer records are rendered. Wire this area to the documented customer list/search API once the backend/frontend slice is implemented."
          />
        ) : (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Customer rows hidden</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Customer records require customers.read before any list or search results should be
              displayed.
            </p>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerWorkflowCoverageCard() {
  const workflows = [
    'Customer list and tenant-wide search',
    'Customer create and duplicate warning',
    'Customer detail profile',
    'Customer edit with optimistic locking',
    'Motorcycle links and service history',
    'Branch-filtered operational history',
    'Customer notes and file attachments',
    'Merge, soft-delete, and restore actions',
    'Audit/status visibility for critical changes',
    'Offline/read-only blocked write states',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planned customer workflow coverage</CardTitle>
        <CardDescription>
          Source-aligned customer management areas for the future verified implementation slice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {workflows.map((workflow) => (
            <ChecklistItem key={workflow} label={workflow} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerQuickActionsCard({ session }: { readonly session: AuthSessionResponseData }) {
  const actions = [
    {
      title: 'Create customer',
      description: 'Create route remains disabled until the verified customer write slice exists.',
      enabled: false,
      disabledReason: hasPermission(session, 'customers.create')
        ? 'Route is planned until customer create APIs and validation are wired.'
        : 'Requires customers.create.',
    },
    {
      title: 'Review motorcycles',
      description: 'Open motorcycle management once its route/slice is available.',
      enabled: false,
      disabledReason: hasPermission(session, 'motorcycles.read')
        ? 'Motorcycle route remains planned in this slice.'
        : 'Requires motorcycles.read.',
    },
    {
      title: 'Open job orders',
      description: 'Use job order workflows for service intake and branch-specific history.',
      href: '/job-orders',
      enabled: hasPermission(session, 'job_orders.read'),
      disabledReason: 'Requires job_orders.read.',
    },
    {
      title: 'Dashboard',
      description: 'Return to the tenant dashboard.',
      href: '/dashboard',
      enabled: true,
      disabledReason: '',
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Documented customer-adjacent destinations only.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {actions.map((action) => (
            <li key={action.title}>
              {action.enabled && 'href' in action ? (
                <ButtonLink href={action.href} variant="secondary" className="w-full justify-start">
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

function CustomerAccessPolicyCard({ session }: { readonly session: AuthSessionResponseData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Access policy</CardTitle>
        <CardDescription>How this page should treat tenant and branch scope.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <p className="text-sm leading-6 text-muted-foreground">
            Customer records are tenant-wide, but linked operational histories remain
            branch-filtered by assigned branch access or tenant-wide branch access.
          </p>
        </Alert>

        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">Branch context:</strong>{' '}
          {session.tenant_wide_branch_access
            ? 'Tenant-wide branch access.'
            : `${session.branches.length} assigned branch(es).`}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerApiPolicyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Implementation guardrails</CardTitle>
        <CardDescription>Keep this UI safe until verified APIs are wired.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <ChecklistItem label="Do not render synthetic customer, motorcycle, job order, note, or file data." />
        <ChecklistItem label="Do not enable create, edit, merge, delete, restore, or upload actions without documented API clients." />
        <ChecklistItem label="Preserve tenant lifecycle, permission, branch, offline, validation, and conflict states." />
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  status,
  description,
}: {
  readonly title: string;
  readonly value: string;
  readonly status: string;
  readonly description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <StatusBadge status={status} />
        </div>
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
    case 'info':
      return 'warning';

    case 'read_only':
    case 'disabled':
      return 'readonly';

    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
    case 'forbidden':
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

function hasPermission(session: AuthSessionResponseData, permission: string): boolean {
  return session.effective_permissions.includes(permission);
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
