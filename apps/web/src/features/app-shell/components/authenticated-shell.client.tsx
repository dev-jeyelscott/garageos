'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

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
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
} from '../../../components/ui';
import { getCurrentSession } from '../../auth/queries/get-current-session.query';
import type { AuthSessionResponseData, AuthTenantStatus } from '../../auth/types/auth-session';
import {
  isTenantBlockedStatus,
  resolveAuthenticatedRedirect,
} from '../../auth/utils/resolve-auth-redirect';
import { isApiClientError } from '../../../lib/api-envelope';

import { platformNavItems, tenantNavItems } from '../constants/app-shell-nav-items';
import {
  tenantMoreMenuItems,
  tenantPlannedRouteConfigs,
} from '../constants/tenant-route.constants';
import type { ProtectedRouteKind, SessionLoadState, ShellNavItem } from '../types/app-shell.types';
import type { TenantMoreMenuItem, TenantPlannedRouteKey } from '../types/tenant-route.types';
import { PlatformAuditLogsContent } from '../../platform/audit-logs/platform-audit-logs.screen';
import { PlatformTenantsContent } from '../../platform/tenants/platform-tenants.screen';
import { PlatformOverviewContent, PlatformOverviewHeaderActions } from '../../platform/overview';
import { PlatformTenantCreateContent } from '../../platform/tenants/platform-tenant-create.screen';
import {
  PlatformTenantDetailContent,
  PlatformTenantDetailHeaderActions,
} from '../../platform/tenants/platform-tenant-detail.screen';

export function PlatformOverviewScreen() {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Platform Overview"
      eyebrow="Platform Admin"
      description="Monitor tenants, subscriptions, support access, exports, deletion jobs, and audit activity."
      actions={<PlatformOverviewHeaderActions session={session} />}
    >
      <PlatformOverviewContent session={session} />
    </AuthenticatedShell>
  );
}

export function PlatformTenantsScreen() {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;
  const canReadTenantList = hasEffectivePermission(session, 'platform.tenants.read');
  const canCreateTenant = hasEffectivePermission(session, 'platform.tenants.create');

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Platform Tenants"
      eyebrow="Platform administration"
      description="View tenant lifecycle and subscription status without entering tenant support access."
      actions={
        canCreateTenant ? (
          <ButtonLink href="/platform/tenants/new" variant="primary">
            Create tenant
          </ButtonLink>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled
            title="Requires platform.tenants.create."
          >
            Create tenant
          </Button>
        )
      }
    >
      <PlatformTenantsContent
        canReadTenantList={canReadTenantList}
        canCreateTenant={canCreateTenant}
      />
    </AuthenticatedShell>
  );
}

export function PlatformAuditLogsScreen() {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;
  const canReadAuditLogs = hasEffectivePermission(session, 'platform.audit_logs.read');

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Platform Audit Logs"
      eyebrow="Platform administration"
      description="Search platform-level audit events without exposing sensitive payloads or entering tenant support access."
      actions={
        <ButtonLink href="/platform" variant="secondary">
          Back to platform
        </ButtonLink>
      }
    >
      <PlatformAuditLogsContent canReadAuditLogs={canReadAuditLogs} />
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

export function TenantPlannedRouteScreen({ route }: { readonly route: TenantPlannedRouteKey }) {
  const sessionState = useProtectedSession('tenant-operational');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="tenant" />;
  }

  const { session } = sessionState;
  const config = tenantPlannedRouteConfigs[route];
  const hasPrimaryPermission =
    config.primaryPermission === null || hasEffectivePermission(session, config.primaryPermission);

  return (
    <AuthenticatedShell
      area="tenant"
      session={session}
      title={config.title}
      eyebrow={config.eyebrow}
      description={config.description}
      actions={
        <>
          <ButtonLink href="/dashboard" variant="secondary">
            Back to dashboard
          </ButtonLink>
          <ButtonLink href="/auth/logout" variant="secondary">
            Logout
          </ButtonLink>
        </>
      }
    >
      <Alert>
        <p className="text-sm font-bold">Route foundation only</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This protected screen confirms navigation, session guarding, tenant lifecycle banners,
          branch context, and offline warnings. Operational writes and module-specific API calls
          stay disabled until the matching backend/frontend slices are implemented.
        </p>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Route"
          value={config.routePath}
          description="Navigation is enabled because this protected scaffold now exists."
        />
        <SummaryCard
          title="Primary permission"
          value={hasPrimaryPermission ? 'Present in session' : 'Not present in session'}
          description={config.primaryPermissionLabel}
        />
        <SummaryCard
          title="Write actions"
          value="Disabled"
          description="No create, edit, approval, upload, payment, or stock-changing action is wired here."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned module coverage</CardTitle>
          <CardDescription>
            These entries describe the documented workflows this route will host later. They are not
            active actions in this scaffold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {config.plannedWorkflows.map((workflow) => (
              <ChecklistItem key={workflow} label={workflow} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Implementation guardrails</CardTitle>
          <CardDescription>
            Keep this screen safe while the real module APIs and workflows are not wired.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {config.guardrails.map((guardrail) => (
            <InfoBlock key={guardrail} title="Guardrail">
              <p>{guardrail}</p>
            </InfoBlock>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session context</CardTitle>
          <CardDescription>
            The shell already exposes tenant status, branch context, and offline state. This card
            keeps route scaffolds transparent without inventing operational data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <InfoBlock title="Tenant access">
            <p>Tenant status: {formatTenantStatus(session.tenant?.status)}</p>
            <p className="mt-2">
              {session.access.can_access_operational_modules
                ? 'Operational modules may be viewed according to permissions and branch access.'
                : 'Operational modules are currently blocked by tenant or session state.'}
            </p>
          </InfoBlock>

          <InfoBlock title="Branch access">
            <p>{getBranchContextLabel(session)}</p>
            <p className="mt-2">
              Branch-specific records must stay scoped by assigned branch access or tenant-wide
              branch access.
            </p>
          </InfoBlock>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

export function TenantMoreMenuScreen() {
  const sessionState = useProtectedSession('tenant-operational');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="tenant" />;
  }

  const { session } = sessionState;
  const availableItems = tenantMoreMenuItems.filter((item) => item.routeExists);
  const plannedItems = tenantMoreMenuItems.filter((item) => !item.routeExists);

  return (
    <AuthenticatedShell
      area="tenant"
      session={session}
      title="More"
      eyebrow="Tenant menu"
      description="Secondary tenant module menu scaffold for documented GarageOS route groups."
      actions={
        <>
          <ButtonLink href="/dashboard" variant="secondary">
            Back to dashboard
          </ButtonLink>
          <ButtonLink href="/auth/logout" variant="secondary">
            Logout
          </ButtonLink>
        </>
      }
    >
      <Alert>
        <p className="text-sm font-bold">Secondary menu scaffold only</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This screen exposes documented tenant route groups without wiring unsupported APIs or
          operational actions. Links are enabled only for route foundations that already exist; all
          other module destinations remain visibly planned and disabled.
        </p>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Enabled routes"
          value={String(availableItems.length)}
          description="Only existing tenant route foundations can be opened from this menu."
        />
        <SummaryCard
          title="Planned destinations"
          value={String(plannedItems.length)}
          description="Disabled until their route scaffolds or real module screens exist."
        />
        <SummaryCard
          title="Write actions"
          value="Disabled"
          description="No create, edit, approval, upload, payment, export, or stock-changing action is wired here."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available route foundations</CardTitle>
          <CardDescription>
            These destinations already have protected tenant route foundations. Permission labels
            are shown for UX awareness; backend authorization remains authoritative.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantMoreMenuGrid items={availableItems} session={session} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planned secondary modules</CardTitle>
          <CardDescription>
            These are documented GarageOS module groups, but their destination routes are not
            enabled in this slice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantMoreMenuGrid items={plannedItems} session={session} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Implementation guardrails</CardTitle>
          <CardDescription>
            Keep the secondary menu safe while the real module routes, APIs, and workflows are added
            incrementally.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <InfoBlock title="Scope control">
            <p>
              Do not add standalone POS, customer portal, payroll, full accounting, 2FA, automatic
              subscription charging, offline write queues, or undocumented module links.
            </p>
          </InfoBlock>
          <InfoBlock title="Route activation rule">
            <p>
              Enable a destination only after the matching route scaffold or module screen exists
              and still routes through the authenticated tenant shell.
            </p>
          </InfoBlock>
          <InfoBlock title="Permission awareness">
            <p>
              Continue showing documented permission labels and blocked states, but rely on backend
              guards for final authorization.
            </p>
          </InfoBlock>
          <InfoBlock title="Operational safety">
            <p>
              Keep all create, edit, approval, payment, upload, export, and stock-changing actions
              disabled until their documented API slices are implemented.
            </p>
          </InfoBlock>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

function TenantMoreMenuGrid({
  items,
  session,
}: {
  readonly items: readonly TenantMoreMenuItem[];
  readonly session: AuthSessionResponseData;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No menu entries"
        description="No documented menu entries are available for this section."
      />
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <TenantMoreMenuCard key={`${item.group}:${item.routePath}`} item={item} session={session} />
      ))}
    </ul>
  );
}

function TenantMoreMenuCard({
  item,
  session,
}: {
  readonly item: TenantMoreMenuItem;
  readonly session: AuthSessionResponseData;
}) {
  const hasPermissionMatch = hasAnyEffectivePermission(session, item.requiredPermissions);
  const permissionLabel = formatPermissionRequirement(item.requiredPermissions);

  return (
    <li className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{item.group}</Badge>
        <Badge
          className={
            item.routeExists
              ? 'border-primary/30 bg-accent text-accent-foreground'
              : 'border-border bg-muted text-muted-foreground'
          }
        >
          {item.routeExists ? 'Route enabled' : 'Planned'}
        </Badge>
        <Badge
          className={
            hasPermissionMatch
              ? 'border-primary/30 bg-accent text-accent-foreground'
              : 'border-border bg-muted text-muted-foreground'
          }
        >
          {hasPermissionMatch ? 'Permission visible' : 'Permission not in session'}
        </Badge>
      </div>

      <div>
        <h2 className="text-base font-black text-foreground">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <p className="font-semibold text-foreground">Route</p>
        <p className="break-words text-muted-foreground">{item.routePath}</p>

        <p className="font-semibold text-foreground">Permission basis</p>
        <p className="break-words text-muted-foreground">{permissionLabel}</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">Planned scope</p>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          {item.plannedScope.map((scopeItem) => (
            <ChecklistItem key={scopeItem} label={scopeItem} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {item.routeExists ? (
          <ButtonLink href={item.routePath} variant="secondary" size="sm">
            Open route
          </ButtonLink>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled
            title="This destination is planned until its route scaffold or module screen exists."
          >
            Planned
          </Button>
        )}

        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {item.routeExists ? 'Foundation available' : 'No active route yet'}
        </p>
      </div>
    </li>
  );
}

function hasAnyEffectivePermission(
  session: AuthSessionResponseData,
  permissions: readonly string[],
): boolean {
  return (
    permissions.length === 0 ||
    permissions.some((permission) => hasEffectivePermission(session, permission))
  );
}

function formatPermissionRequirement(permissions: readonly string[]): string {
  if (permissions.length === 0) {
    return 'Authenticated tenant session';
  }

  if (permissions.length === 1) {
    return permissions[0] ?? 'Authenticated tenant session';
  }

  return `Any documented permission: ${permissions.join(', ')}`;
}

export function PlatformTenantCreateScreen() {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;
  const canCreateTenant = hasEffectivePermission(session, 'platform.tenants.create');

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Create Tenant"
      eyebrow="Platform administration"
      description="Create a platform-managed tenant with an assigned plan, subscription dates, and a shop owner invitation."
      actions={
        <ButtonLink href="/platform/tenants" variant="secondary">
          Back to tenants
        </ButtonLink>
      }
    >
      <PlatformTenantCreateContent canCreateTenant={canCreateTenant} />
    </AuthenticatedShell>
  );
}

export function PlatformTenantDetailScreen({ tenantId }: { readonly tenantId: string }) {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Tenant Detail"
      eyebrow="Platform administration"
      description="Read tenant metadata, lifecycle state, and subscription status without entering support access."
      actions={<PlatformTenantDetailHeaderActions />}
    >
      <PlatformTenantDetailContent tenantId={tenantId} session={session} />
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

export function ForbiddenState({
  title,
  requiredPermission,
  description,
  detail = null,
}: {
  readonly title: string;
  readonly requiredPermission: string;
  readonly description: string;
  readonly detail?: string | null;
}) {
  return (
    <Alert variant="destructive">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Required permission: <strong>{requiredPermission}</strong>
      </p>
      {detail === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </Alert>
  );
}

function hasEffectivePermission(session: AuthSessionResponseData, permission: string): boolean {
  return session.effective_permissions.includes(permission);
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
  const pathname = usePathname();
  const networkStatus = useNetworkStatus();

  if (area === 'platform') {
    return (
      <PlatformAuthenticatedShell
        session={session}
        title={title}
        eyebrow={eyebrow}
        description={description}
        actions={actions}
        pathname={pathname}
      >
        {children}
      </PlatformAuthenticatedShell>
    );
  }

  return (
    <main className="min-h-dvh bg-background pb-24 text-foreground md:pb-0">
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <AppBrandLink area={area} session={session} />

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <BranchContextBadge session={session} />
              <StatusBadge status={session.tenant?.status} fallback="unknown" />
              <Badge className="max-w-[12rem] truncate">{session.user.full_name}</Badge>
              <ButtonLink href="/auth/logout" variant="ghost" size="sm">
                Logout
              </ButtonLink>
            </div>
          </div>

          <ShellNavigation area={area} navItems={tenantNavItems} pathname={pathname} />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <TenantStatusBanner session={session} />
        <OfflineBanner networkStatus={networkStatus} />

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

      <MobileTenantNavigation navItems={tenantNavItems} pathname={pathname} />
    </main>
  );
}

function PlatformAuthenticatedShell({
  session,
  title,
  eyebrow,
  description,
  actions,
  pathname,
  children,
}: {
  readonly session: AuthSessionResponseData;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly pathname: string;
  readonly children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="flex min-h-dvh">
        <PlatformDesktopSidebar session={session} pathname={pathname} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <PlatformMobileNavigation session={session} pathname={pathname} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Platform Admin
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Full-width operations workspace
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <StatusBadge status="platform" />
                <Badge className="max-w-[12rem] truncate">{session.user.full_name}</Badge>
                <ButtonLink href="/auth/logout" variant="ghost" size="sm">
                  Logout
                </ButtonLink>
              </div>
            </div>
          </div>

          <div className="grid w-full max-w-none gap-5 px-4 py-6 sm:px-6 lg:px-8">
            <header className="grid gap-4 rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6 xl:grid-cols-[1fr_auto] xl:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-3 max-w-5xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                  {description}
                </p>
              </div>

              {actions === undefined ? null : <div className="flex flex-wrap gap-3">{actions}</div>}
            </header>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

function PlatformDesktopSidebar({
  session,
  pathname,
}: {
  readonly session: AuthSessionResponseData;
  readonly pathname: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border bg-card px-4 py-5 shadow-sm lg:flex lg:flex-col">
      <AppBrandLink area="platform" session={session} />

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <PlatformShellNavigation navItems={platformNavItems} pathname={pathname} />
      </div>

      <Alert className="mt-6">
        <p className="text-sm font-bold">Support access guardrail</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Support access requires reason, mode, expiry, and backend audit logging.
        </p>
      </Alert>
    </aside>
  );
}

function PlatformMobileNavigation({
  session,
  pathname,
}: {
  readonly session: AuthSessionResponseData;
  readonly pathname: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="lg:hidden">
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[20rem] max-w-[86vw] p-0">
        <SheetHeader className="border-b border-border p-4 pr-12">
          <SheetTitle>Platform Admin</SheetTitle>
        </SheetHeader>

        <div className="grid gap-5 p-4">
          <AppBrandLink area="platform" session={session} />
          <PlatformShellNavigation navItems={platformNavItems} pathname={pathname} mobile />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PlatformShellNavigation({
  navItems,
  pathname,
  mobile = false,
}: {
  readonly navItems: readonly ShellNavItem[];
  readonly pathname: string;
  readonly mobile?: boolean;
}) {
  return (
    <nav aria-label="Platform admin navigation">
      <ul className={mobile ? 'grid gap-2' : 'grid gap-2'}>
        {navItems.map((item) => (
          <li key={item.label}>
            <PlatformShellLink item={item} pathname={pathname} mobile={mobile} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PlatformShellLink({
  item,
  pathname,
  mobile,
}: {
  readonly item: ShellNavItem;
  readonly pathname: string;
  readonly mobile: boolean;
}) {
  if (item.href === undefined) {
    return <PlatformNavDisabledItem item={item} />;
  }

  const isActive = isShellNavItemActive(pathname, item.href);
  const linkClassName = isActive
    ? 'flex min-h-11 items-center rounded-2xl border border-primary/30 bg-primary px-4 text-sm font-black text-primary-foreground no-underline shadow-sm'
    : 'flex min-h-11 items-center rounded-2xl border border-transparent px-4 text-sm font-semibold text-muted-foreground no-underline transition hover:border-primary/20 hover:bg-accent hover:text-accent-foreground';

  const link = (
    <Link href={item.href} aria-current={isActive ? 'page' : undefined} className={linkClassName}>
      {item.label}
    </Link>
  );

  return mobile ? <SheetClose asChild>{link}</SheetClose> : link;
}

function PlatformNavDisabledItem({ item }: { readonly item: ShellNavItem }) {
  return (
    <span
      title={item.disabledReason}
      aria-disabled="true"
      className="flex min-h-11 cursor-not-allowed items-center rounded-2xl border border-border bg-muted px-4 text-sm font-semibold text-muted-foreground opacity-75"
    >
      {item.label}
    </span>
  );
}

function AppBrandLink({
  area,
  session,
}: {
  readonly area: 'platform' | 'tenant';
  readonly session: AuthSessionResponseData;
}) {
  return (
    <Link
      href={area === 'platform' ? '/platform' : '/dashboard'}
      aria-label="GarageOS home"
      className="inline-flex min-h-12 min-w-0 items-center gap-3 no-underline"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm sm:h-14 sm:w-14">
        <Image
          src="/images/logo.png"
          alt=""
          width={96}
          height={96}
          priority
          className="h-9 w-9 object-contain sm:h-11 sm:w-11"
        />
      </span>

      <span className="min-w-0">
        <span className="hidden rounded-2xl border border-border/70 bg-[rgb(var(--foreground))] px-3 py-2 shadow-sm dark:bg-card sm:inline-flex">
          <Image
            src="/images/garageos.png"
            alt=""
            width={168}
            height={60}
            priority
            className="h-auto w-[118px] object-contain md:w-[136px]"
          />
        </span>
      </span>
    </Link>
  );
}

function ShellNavigation({
  area,
  navItems,
  pathname,
}: {
  readonly area: 'platform' | 'tenant';
  readonly navItems: readonly ShellNavItem[];
  readonly pathname: string;
}) {
  return (
    <nav
      aria-label={area === 'platform' ? 'Platform admin navigation' : 'Tenant navigation'}
      className={area === 'tenant' ? 'hidden md:block' : undefined}
    >
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {navItems.map((item) => (
          <li key={item.label}>
            <ShellNavLink item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ShellNavLink({
  item,
  pathname,
}: {
  readonly item: ShellNavItem;
  readonly pathname: string;
}) {
  if (item.href === undefined) {
    return (
      <span
        title={item.disabledReason}
        aria-disabled="true"
        className="inline-flex min-h-10 cursor-not-allowed items-center whitespace-nowrap rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground"
      >
        {item.label}
      </span>
    );
  }

  const isActive = isShellNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'inline-flex min-h-10 items-center whitespace-nowrap rounded-xl border border-primary/30 bg-primary px-3 text-sm font-bold text-primary-foreground no-underline shadow-sm'
          : 'inline-flex min-h-10 items-center whitespace-nowrap rounded-xl border border-primary/20 bg-accent px-3 text-sm font-semibold text-accent-foreground no-underline transition hover:border-primary/35 hover:bg-primary/10'
      }
    >
      {item.label}
    </Link>
  );
}

function MobileTenantNavigation({
  navItems,
  pathname,
}: {
  readonly navItems: readonly ShellNavItem[];
  readonly pathname: string;
}) {
  return (
    <nav
      aria-label="Tenant mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 py-2 shadow-[0_-18px_44px_rgb(15_23_42_/_0.10)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
        {navItems.map((item) => {
          const isActive = item.href !== undefined && isShellNavItemActive(pathname, item.href);

          return (
            <li key={item.label}>
              {item.href === undefined ? (
                <span
                  title={item.disabledReason}
                  aria-disabled="true"
                  className="flex min-h-14 cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-transparent px-2 text-center text-[0.68rem] font-bold leading-tight text-muted-foreground opacity-70"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'flex min-h-14 flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary px-2 text-center text-[0.68rem] font-black leading-tight text-primary-foreground no-underline shadow-sm'
                      : 'flex min-h-14 flex-col items-center justify-center rounded-2xl border border-transparent px-2 text-center text-[0.68rem] font-bold leading-tight text-muted-foreground no-underline transition hover:bg-accent hover:text-accent-foreground'
                  }
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BranchContextBadge({ session }: { readonly session: AuthSessionResponseData }) {
  return <Badge>{getBranchContextLabel(session)}</Badge>;
}

function OfflineBanner({ networkStatus }: { readonly networkStatus: 'online' | 'offline' }) {
  if (networkStatus === 'online') {
    return null;
  }

  return (
    <Alert variant="destructive">
      <p className="text-sm font-bold">Offline mode</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        GarageOS is offline. Operational writes must stay blocked until the network connection is
        restored.
      </p>
    </Alert>
  );
}

function useNetworkStatus(): 'online' | 'offline' {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline ? 'online' : 'offline';
}

function getBranchContextLabel(session: AuthSessionResponseData): string {
  if (session.tenant_wide_branch_access) {
    return session.branches.length > 1
      ? `Tenant-wide · ${session.branches.length} branches`
      : 'Tenant-wide branch access';
  }

  if (session.branches.length === 0) {
    return 'No branch assignment';
  }

  if (session.branches.length === 1) {
    return session.branches[0]?.name ?? 'Assigned branch';
  }

  return `${session.branches.length} assigned branches`;
}

function isShellNavItemActive(pathname: string, href: string): boolean {
  if (href === '/platform') {
    return pathname === '/platform';
  }

  if (href === '/dashboard') {
    return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
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
  readonly status: string | undefined;
  readonly fallback?: string;
}) {
  const resolvedStatus = status === undefined ? fallback : status;

  return (
    <Badge variant={getStatusBadgeVariant(resolvedStatus)}>
      {formatStatusLabel(resolvedStatus)}
    </Badge>
  );
}

function getStatusBadgeVariant(
  status: string,
):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info'
  | 'readonly' {
  switch (status) {
    case 'active':
    case 'succeeded':
      return 'success';

    case 'pending_setup':
    case 'grace_period':
    case 'platform_override':
    case 'planned':
      return 'warning';

    case 'read_only':
    case 'system_computed':
    case 'cancelled':
      return 'readonly';

    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
    case 'failed':
    case 'dead_lettered':
    case 'write_allowed':
    case 'forbidden':
      return 'destructive';

    case 'queued':
    case 'running':
    case 'platform':
    case 'platform_admin':
    case 'tenant_user':
    case 'system':
      return 'info';

    default:
      return 'secondary';
  }
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function SummaryCard({
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

  if (kind === 'tenant-dashboard' || kind === 'tenant-operational') {
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

export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  return fallback;
}

export function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const requestId = error.requestId === null ? 'N/A' : error.requestId;
  const correlationId = error.correlationId === null ? 'N/A' : error.correlationId;

  return `Code: ${error.code}. Request: ${requestId}. Correlation: ${correlationId}.`;
}

export function formatTenantStatus(status: AuthTenantStatus | undefined): string {
  if (status === undefined) {
    return 'Unknown';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSupportAccessMode(mode: string): string {
  return mode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
