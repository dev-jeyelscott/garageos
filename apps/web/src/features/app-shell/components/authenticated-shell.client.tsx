'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

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
} from '../../../components/ui';
import { getAccessTokenOrRefresh, getAuthJson } from '../../auth/actions/login.action';
import { getCurrentSession } from '../../auth/queries/get-current-session.query';
import type { AuthSessionResponseData, AuthTenantStatus } from '../../auth/types/auth-session';
import {
  isTenantBlockedStatus,
  resolveAuthenticatedRedirect,
} from '../../auth/utils/resolve-auth-redirect';
import { isApiClientError } from '../../../lib/api-envelope';

type ProtectedRouteKind = 'platform' | 'tenant-dashboard' | 'tenant-onboarding' | 'tenant-status';

type SessionLoadState =
  | {
      readonly status: 'loading';
    }
  | {
      readonly status: 'ready';
      readonly session: AuthSessionResponseData;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

interface ShellNavItem {
  readonly label: string;
  readonly href?: string;
  readonly disabledReason?: string;
}

interface PlatformTenantListItem {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email?: string | null;
  readonly status: AuthTenantStatus;
  readonly timezone?: string | null;
  readonly plan?: {
    readonly name?: string | null;
  } | null;
  readonly subscription?: {
    readonly plan_name?: string | null;
    readonly expiration_date?: string | null;
  } | null;
}

type PlatformTenantListState =
  | {
      readonly status: 'idle' | 'loading';
    }
  | {
      readonly status: 'loaded';
      readonly tenants: readonly PlatformTenantListItem[];
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

const platformNavItems: readonly ShellNavItem[] = [
  {
    label: 'Tenants',
    href: '/platform/tenants',
  },
  {
    label: 'Plans',
    disabledReason: 'Route comes after the tenant list foundation.',
  },
  {
    label: 'Support Access',
    disabledReason: 'Requires tenant-specific audited support access flow.',
  },
  {
    label: 'Exports',
    disabledReason: 'Requires tenant export workflow route.',
  },
  {
    label: 'Deletion Jobs',
    disabledReason: 'Requires tenant deletion workflow route.',
  },
  {
    label: 'Platform Audit Logs',
    disabledReason: 'Requires platform audit log route.',
  },
];

const tenantNavItems: readonly ShellNavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
  },
  {
    label: 'Job Orders',
    disabledReason: 'Tenant operational routes come after shell foundation.',
  },
  {
    label: 'Customers',
    disabledReason: 'Tenant operational routes come after shell foundation.',
  },
  {
    label: 'Inventory',
    disabledReason: 'Tenant operational routes come after shell foundation.',
  },
  {
    label: 'More',
    disabledReason: 'Secondary tenant menu comes after shell foundation.',
  },
];

export function PlatformTenantsScreen() {
  const sessionState = useProtectedSession('platform');
  const [searchTerm, setSearchTerm] = useState('');
  const [tenantListState, setTenantListState] = useState<PlatformTenantListState>({
    status: 'idle',
  });

  useEffect(() => {
    if (sessionState.status !== 'ready') {
      return;
    }

    let active = true;

    async function loadTenants() {
      setTenantListState({ status: 'loading' });

      try {
        const tenants = await getPlatformTenants();

        if (!active) {
          return;
        }

        setTenantListState({
          status: 'loaded',
          tenants,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setTenantListState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load platform tenants.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadTenants();

    return () => {
      active = false;
    };
  }, [sessionState]);

  const filteredTenants = useMemo(() => {
    if (tenantListState.status !== 'loaded') {
      return [];
    }

    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (normalizedSearchTerm.length === 0) {
      return tenantListState.tenants;
    }

    return tenantListState.tenants.filter((tenant) => {
      const haystack = [
        tenant.business_name,
        tenant.shop_email ?? '',
        tenant.status,
        tenant.timezone ?? '',
        tenant.subscription?.plan_name ?? '',
        tenant.plan?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearchTerm);
    });
  }, [searchTerm, tenantListState]);

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  return (
    <AuthenticatedShell
      area="platform"
      session={sessionState.session}
      title="Platform Tenants"
      eyebrow="Platform administration"
      description="View tenant lifecycle and subscription status without entering tenant support access."
      actions={
        <Button
          type="button"
          variant="secondary"
          disabled
          title="Create tenant route is not wired yet."
        >
          Create tenant
        </Button>
      }
    >
      <Alert>
        <p className="text-sm leading-6">
          This page uses the documented platform tenant list endpoint only. Subscription overrides,
          support access, exports, deletion jobs, and platform audit log workflows remain navigation
          placeholders until their routes are implemented.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Tenant list</CardTitle>
          <CardDescription>
            Search loaded tenants by business name, email, status, plan, or timezone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Search tenants</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm"
              placeholder="Search tenant name, email, status, plan..."
            />
          </label>

          <div className="mt-5">
            {tenantListState.status === 'idle' || tenantListState.status === 'loading' ? (
              <TenantListSkeleton />
            ) : null}

            {tenantListState.status === 'error' ? (
              <Alert variant="destructive">
                <p className="text-sm font-bold">{tenantListState.message}</p>
                {tenantListState.detail === null ? null : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {tenantListState.detail}
                  </p>
                )}
              </Alert>
            ) : null}

            {tenantListState.status === 'loaded' && filteredTenants.length === 0 ? (
              <EmptyState
                title="No tenants found"
                description="No platform tenants matched the current search or the tenant list is empty."
              />
            ) : null}

            {tenantListState.status === 'loaded' && filteredTenants.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-4 border-b border-border bg-muted px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground md:grid">
                  <span>Tenant</span>
                  <span>Status</span>
                  <span>Plan</span>
                  <span>Expiration</span>
                </div>

                <ul className="divide-y divide-border">
                  {filteredTenants.map((tenant) => (
                    <li
                      key={tenant.id}
                      className="grid gap-3 bg-card p-4 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr] md:items-center"
                    >
                      <div>
                        <p className="font-bold text-foreground">{tenant.business_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {tenant.shop_email ?? 'No shop email returned'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tenant.timezone ?? 'Timezone not returned'}
                        </p>
                      </div>

                      <div>
                        <StatusBadge status={tenant.status} />
                      </div>

                      <p className="text-sm font-semibold text-foreground">
                        {tenant.subscription?.plan_name ?? tenant.plan?.name ?? 'Plan not returned'}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {tenant.subscription?.expiration_date ?? 'Expiration not returned'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

export function TenantDashboardScreen() {
  const sessionState = useProtectedSession('tenant-dashboard');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="tenant" />;
  }

  const { session } = sessionState;
  const warnings = session.subscription?.warnings ?? [];

  return (
    <AuthenticatedShell
      area="tenant"
      session={session}
      title="Dashboard"
      eyebrow="Tenant workspace"
      description="Dashboard foundation based on authenticated session state only."
      actions={
        <>
          <ButtonLink href="/auth/password/change" variant="secondary">
            Change password
          </ButtonLink>
          <ButtonLink href="/auth/logout" variant="secondary">
            Logout
          </ButtonLink>
        </>
      }
    >
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

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Tenant status"
          value={formatTenantStatus(session.tenant?.status)}
          description="Operational access is still backend-authoritative."
        />
        <SummaryCard
          title="Access mode"
          value={session.access.read_only ? 'Read-only' : 'Writable when permitted'}
          description={
            session.access.can_access_operational_modules
              ? 'Operational modules are available by permission.'
              : 'Operational modules are blocked by tenant/session state.'
          }
        />
        <SummaryCard
          title="Plan"
          value={session.effective_plan?.name ?? 'Plan not returned'}
          description={`Expiration: ${session.subscription?.expiration_date ?? 'N/A'}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard foundation</CardTitle>
          <CardDescription>
            No operational metrics are invented here. Dashboard widgets should be wired only to the
            documented dashboard/report APIs when those frontend slices are implemented.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <InfoBlock title="Branch access">
            <p>
              {session.tenant_wide_branch_access
                ? 'Tenant-wide branch access'
                : 'Assigned branches only'}
            </p>
            <p className="mt-2 text-muted-foreground">
              {session.branches.length === 0
                ? 'No branches returned in session.'
                : `${session.branches.length} branch assignment(s) returned.`}
            </p>
          </InfoBlock>

          <InfoBlock title="Permissions">
            <p>{session.effective_permissions.length} effective permission(s)</p>
            <p className="mt-2 text-muted-foreground">
              Permission-aware navigation is a UX aid. Backend authorization remains authoritative.
            </p>
          </InfoBlock>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

export function OnboardingGateScreen() {
  const sessionState = useProtectedSession('tenant-onboarding');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="tenant" />;
  }

  return (
    <AuthenticatedShell
      area="tenant"
      session={sessionState.session}
      title="Onboarding"
      eyebrow="Pending setup"
      description="Setup gate for pending-setup tenants before operational access."
      actions={
        <>
          <ButtonLink href="/auth/password/change" variant="secondary">
            Change password
          </ButtonLink>
          <ButtonLink href="/auth/logout" variant="secondary">
            Logout
          </ButtonLink>
        </>
      }
    >
      <Alert>
        <p className="text-sm leading-6">
          This route is the onboarding shell foundation. Profile setup, first branch setup,
          subscription information, and complete-onboarding actions should be wired to their
          documented APIs in the onboarding implementation step.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Setup checklist foundation</CardTitle>
          <CardDescription>
            The backend onboarding state remains authoritative; this UI must not unlock operational
            modules until onboarding is complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm text-muted-foreground">
            <ChecklistItem label="Shop profile setup" />
            <ChecklistItem label="Tax and localization setup" />
            <ChecklistItem label="Invoice prefix setup" />
            <ChecklistItem label="First active branch setup" />
            <ChecklistItem label="Owner and subscription verification" />
          </ul>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

export function TenantBlockedStatusScreen() {
  const sessionState = useProtectedSession('tenant-status');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="tenant" />;
  }

  const tenantStatus = sessionState.session.tenant?.status;

  return (
    <AuthenticatedShell
      area="tenant"
      session={sessionState.session}
      title="Account Status"
      eyebrow="Access blocked"
      description="Tenant lifecycle status currently blocks normal operational access."
      actions={
        <>
          <ButtonLink href="/auth/password/change" variant="secondary">
            Change password
          </ButtonLink>
          <ButtonLink href="/auth/logout" variant="secondary">
            Logout
          </ButtonLink>
        </>
      }
    >
      <Alert variant="destructive">
        <p className="text-sm font-bold">Tenant status: {formatTenantStatus(tenantStatus)}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Operational modules stay blocked for this tenant lifecycle state. Renewal, export, and
          emergency extension actions should be wired only through documented owner/platform flows.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Allowed next actions</CardTitle>
          <CardDescription>
            This screen intentionally avoids unsupported operational actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <p>Password management and logout remain available where the session is valid.</p>
          <p>
            Shop Owner renewal/export flows and platform emergency-extension workflows should be
            implemented in their dedicated documented steps.
          </p>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

function useProtectedSession(kind: ProtectedRouteKind): SessionLoadState {
  const router = useRouter();
  const [state, setState] = useState<SessionLoadState>({ status: 'loading' });

  const loadSession = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const session = await getCurrentSession();

      setState({
        status: 'ready',
        session,
      });
    } catch (error) {
      setState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const redirectTo = resolveRouteAccess(kind, state.session);

    if (redirectTo !== null) {
      router.replace(redirectTo);
    }
  }, [kind, router, state]);

  if (state.status !== 'ready') {
    return state;
  }

  const redirectTo = resolveRouteAccess(kind, state.session);

  if (redirectTo !== null) {
    return { status: 'loading' };
  }

  return state;
}

function resolveRouteAccess(
  kind: ProtectedRouteKind,
  session: AuthSessionResponseData,
): string | null {
  if (!session.user.email_verified) {
    return '/auth/email-verification';
  }

  if (kind === 'platform') {
    return session.user.user_type === 'platform_admin'
      ? null
      : resolveAuthenticatedRedirect(session);
  }

  if (session.user.user_type === 'platform_admin') {
    return '/platform/tenants';
  }

  const tenantStatus = session.tenant?.status;

  if (tenantStatus === undefined) {
    return kind === 'tenant-status' ? null : '/account/status';
  }

  if (kind === 'tenant-dashboard') {
    if (tenantStatus === 'pending_setup') {
      return '/onboarding';
    }

    if (isTenantBlockedStatus(tenantStatus)) {
      return '/account/status';
    }

    return null;
  }

  if (kind === 'tenant-onboarding') {
    return tenantStatus === 'pending_setup' ? null : resolveAuthenticatedRedirect(session);
  }

  if (kind === 'tenant-status') {
    return isTenantBlockedStatus(tenantStatus) ? null : resolveAuthenticatedRedirect(session);
  }

  return resolveAuthenticatedRedirect(session);
}

async function getPlatformTenants(): Promise<readonly PlatformTenantListItem[]> {
  const accessToken = await getAccessTokenOrRefresh();
  const data = await getAuthJson<readonly PlatformTenantListItem[]>('/platform/tenants', {
    accessToken,
  });

  return Array.isArray(data) ? data : [];
}

function SessionStateScreen({
  state,
  area,
}: {
  readonly state: Exclude<SessionLoadState, { readonly status: 'ready' }>;
  readonly area: 'platform' | 'tenant';
}) {
  const isPlatform = area === 'platform';

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-5xl place-items-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              {isPlatform ? 'Platform administration' : 'Tenant workspace'}
            </p>
            <CardTitle>
              {state.status === 'loading' ? 'Loading session' : 'Session unavailable'}
            </CardTitle>
            <CardDescription>
              {state.status === 'loading'
                ? 'Resolving authenticated GarageOS access.'
                : state.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.status === 'loading' ? (
              <div className="grid gap-3" aria-busy="true" aria-live="polite">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Alert variant="destructive">
                <p className="text-sm font-bold">{state.message}</p>
                {state.detail === null ? null : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.detail}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <ButtonLink href="/auth/login" variant="secondary">
                    Login
                  </ButtonLink>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function AuthenticatedShell({
  area,
  session,
  title,
  eyebrow,
  description,
  actions,
  children,
}: {
  readonly area: 'platform' | 'tenant';
  readonly session: AuthSessionResponseData;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const navItems = area === 'platform' ? platformNavItems : tenantNavItems;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-card/95 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href="/" className="inline-flex min-h-11 items-center gap-3 no-underline">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
                  G
                </span>
                <span>
                  <span className="block text-sm font-black tracking-tight">GarageOS</span>
                  <span className="block text-xs font-semibold text-muted-foreground">
                    {area === 'platform'
                      ? 'Platform Admin'
                      : (session.tenant?.business_name ?? 'Tenant')}
                  </span>
                </span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={session.tenant?.status}
                fallback={area === 'platform' ? 'platform' : 'unknown'}
              />
              <Badge>{session.user.full_name}</Badge>
              <ButtonLink href="/auth/logout" variant="ghost" size="sm">
                Logout
              </ButtonLink>
            </div>
          </div>

          <nav aria-label={area === 'platform' ? 'Platform admin navigation' : 'Tenant navigation'}>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.href === undefined ? (
                    <span
                      title={item.disabledReason}
                      aria-disabled="true"
                      className="inline-flex min-h-10 cursor-not-allowed items-center whitespace-nowrap rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="inline-flex min-h-10 items-center whitespace-nowrap rounded-xl border border-primary/20 bg-accent px-3 text-sm font-semibold text-accent-foreground no-underline"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        {area === 'platform' ? (
          <Alert>
            <p className="text-sm leading-6">
              Platform admin context. Tenant support access is not active on this shell and must not
              be treated as tenant impersonation.
            </p>
          </Alert>
        ) : (
          <TenantStatusBanner session={session} />
        )}

        <header className="grid gap-4 rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {description}
            </p>
          </div>

          {actions === undefined ? null : <div className="flex flex-wrap gap-3">{actions}</div>}
        </header>

        {children}
      </div>
    </main>
  );
}

function TenantStatusBanner({ session }: { readonly session: AuthSessionResponseData }) {
  const status = session.tenant?.status;

  if (status === undefined || status === 'active') {
    return null;
  }

  const isBlocked = status === 'suspended' || status === 'pending_deletion' || status === 'deleted';

  return (
    <Alert variant={isBlocked ? 'destructive' : 'default'}>
      <p className="text-sm font-bold">Tenant status: {formatTenantStatus(status)}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {status === 'pending_setup'
          ? 'Operational modules remain blocked until onboarding is complete.'
          : null}
        {status === 'grace_period'
          ? 'Full access continues by permission, with renewal warnings shown where returned by the API.'
          : null}
        {status === 'read_only'
          ? 'Viewing and allowed read/report/export flows may continue, but operational writes are blocked.'
          : null}
        {isBlocked ? 'Normal operational access is blocked for this tenant lifecycle state.' : null}
      </p>
    </Alert>
  );
}

function StatusBadge({
  status,
  fallback = 'unknown',
}: {
  readonly status: AuthTenantStatus | undefined;
  readonly fallback?: string;
}) {
  const label = status === undefined ? fallback : formatTenantStatus(status);

  return <Badge>{label}</Badge>;
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

function InfoBlock({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-muted/50 p-4 text-sm">
      <h2 className="font-bold text-foreground">{title}</h2>
      <div className="mt-2 leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function ChecklistItem({ label }: { readonly label: string }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-black text-muted-foreground"
      >
        •
      </span>
      <span>{label}</span>
    </li>
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
    <div className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-center">
      <h2 className="font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function TenantListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
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

  const requestId = error.requestId === null ? 'N/A' : error.requestId;
  const correlationId = error.correlationId === null ? 'N/A' : error.correlationId;

  return `Code: ${error.code}. Request: ${requestId}. Correlation: ${correlationId}.`;
}

function formatTenantStatus(status: AuthTenantStatus | undefined): string {
  if (status === undefined) {
    return 'Unknown';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
