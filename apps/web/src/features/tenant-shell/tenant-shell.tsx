import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge, ButtonLink, Card, Container, cn } from '../../components/ui';
import type { AuthSessionResponseData, AuthTenantStatus } from '../auth/types/auth-session';

export type AppModule =
  | 'dashboard'
  | 'branches'
  | 'employees'
  | 'roles'
  | 'customers'
  | 'customer_tags';

export interface TenantShellSession {
  readonly session: AuthSessionResponseData;
  readonly activeBranchId: string | null;
  readonly isOffline: boolean;
}

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly module: AppModule;
  readonly requiredPermission: string | null;
  readonly mobilePrimary?: boolean;
}

const navItems: readonly NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    module: 'dashboard',
    requiredPermission: 'reports.view_basic',
    mobilePrimary: true,
  },
  {
    label: 'Customers',
    href: '/customers',
    module: 'customers',
    requiredPermission: 'customers.read',
    mobilePrimary: true,
  },
  { label: 'Branches', href: '/branches', module: 'branches', requiredPermission: 'branches.read' },
  { label: 'Employees', href: '/employees', module: 'employees', requiredPermission: 'users.read' },
  { label: 'Roles', href: '/roles', module: 'roles', requiredPermission: 'roles.read' },
  {
    label: 'Tags',
    href: '/customer-tags',
    module: 'customer_tags',
    requiredPermission: 'customers.read',
  },
];

export function TenantAppShell({
  children,
  currentModule,
  primaryAction,
  shellSession = createMockShellSession(),
}: {
  readonly children: ReactNode;
  readonly currentModule: AppModule;
  readonly primaryAction?: ReactNode;
  readonly shellSession?: TenantShellSession;
}) {
  const allowedNavItems = navItems.filter((item) =>
    item.requiredPermission === null
      ? true
      : shellSession.session.effective_permissions.includes(item.requiredPermission),
  );

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <Container className="flex min-h-16 items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link href="/dashboard" className="block text-lg font-bold text-foreground">
              GarageOS
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {shellSession.session.tenant?.business_name ?? 'Tenant workspace'}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <BranchContextIndicator shellSession={shellSession} />
            <Badge>{shellSession.session.user.full_name}</Badge>
          </div>
        </Container>
      </header>

      <Container className="grid gap-4 py-4 md:grid-cols-[15rem_1fr] md:py-6">
        <aside className="hidden md:block">
          <nav className="sticky top-24 grid gap-1" aria-label="Tenant modules">
            {allowedNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground',
                  item.module === currentModule && 'bg-accent text-accent-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-4">
          <TenantStatusBanner status={shellSession.session.tenant?.status ?? 'active'} />
          <OfflineIndicator isOffline={shellSession.isOffline} />
          {children}
        </main>
      </Container>

      {primaryAction !== undefined ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card p-3 shadow-md md:hidden">
          {primaryAction}
        </div>
      ) : null}

      <MobileBottomNav currentModule={currentModule} navItems={allowedNavItems} />
    </div>
  );
}

function MobileBottomNav({
  currentModule,
  navItems,
}: {
  readonly currentModule: AppModule;
  readonly navItems: readonly NavItem[];
}) {
  const primaryItems = navItems.filter((item) => item.mobilePrimary);
  const moreItems = navItems.filter((item) => !item.mobilePrimary);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-card md:hidden"
      aria-label="Primary mobile navigation"
    >
      {primaryItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex min-h-16 items-center justify-center px-2 text-center text-xs font-semibold text-muted-foreground',
            item.module === currentModule && 'bg-accent text-accent-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
      <details className="relative">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-center px-2 text-xs font-semibold text-muted-foreground">
          More
        </summary>
        <div className="absolute bottom-16 right-2 grid min-w-48 gap-1 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-semibold',
                item.module === currentModule
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

function TenantStatusBanner({ status }: { readonly status: AuthTenantStatus }) {
  const copy = tenantStatusCopy[status];

  if (status === 'active') {
    return null;
  }

  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm', copy.className)} role="status">
      <div className="font-semibold">{copy.title}</div>
      <p className="mt-1">{copy.message}</p>
    </div>
  );
}

function OfflineIndicator({ isOffline }: { readonly isOffline: boolean }) {
  if (!isOffline) {
    return null;
  }

  return (
    <div
      className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground"
      role="status"
    >
      <div className="font-semibold">Offline read-only mode</div>
      <p className="mt-1 text-muted-foreground">
        Creates, edits, approvals, uploads, payments, and settings changes are blocked until the
        connection returns.
      </p>
    </div>
  );
}

function BranchContextIndicator({ shellSession }: { readonly shellSession: TenantShellSession }) {
  const activeBranch = shellSession.session.branches.find(
    (branch) => branch.id === shellSession.activeBranchId,
  );

  if (shellSession.session.tenant_wide_branch_access) {
    return <Badge>All branches</Badge>;
  }

  return <Badge>{activeBranch?.name ?? 'Branch scoped'}</Badge>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-normal text-foreground">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action !== undefined ? <div className="hidden shrink-0 sm:block">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading records' }: { readonly label?: string }) {
  return (
    <Card className="space-y-3 p-4" aria-busy="true">
      <div className="h-4 w-32 rounded bg-secondary" />
      <div className="h-16 rounded-xl bg-secondary" />
      <div className="h-16 rounded-xl bg-secondary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

export function BlockedState({
  title,
  message,
  tone = 'neutral',
}: {
  readonly title: string;
  readonly message: string;
  readonly tone?: 'neutral' | 'danger' | 'warning';
}) {
  return (
    <Card
      className={cn(
        'p-4',
        tone === 'danger' && 'border-destructive',
        tone === 'warning' && 'border-warning',
      )}
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </Card>
  );
}

export function StandardStateGallery() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <LoadingState />
      <EmptyState
        title="No records yet"
        message="Records will appear here when the API returns data."
      />
      <BlockedState
        title="Forbidden"
        message="Your role does not include the required permission."
        tone="danger"
      />
      <BlockedState
        title="Subscription blocked"
        message="This action is unavailable for the current tenant status or plan."
        tone="warning"
      />
      <BlockedState
        title="Offline blocked"
        message="Reconnect before creating, editing, approving, uploading, or changing settings."
      />
      <BlockedState
        title="Validation failed"
        message="Field errors from the API are shown next to the affected inputs."
        tone="warning"
      />
      <BlockedState
        title="Conflict"
        message="The record changed or the idempotency key was reused. Reload and retry."
        tone="warning"
      />
    </div>
  );
}

export function GuardedPrimaryAction({
  href,
  label,
  requiredPermission,
  shellSession,
}: {
  readonly href: string;
  readonly label: string;
  readonly requiredPermission: string;
  readonly shellSession: TenantShellSession;
}) {
  const canUse =
    !shellSession.isOffline &&
    !shellSession.session.access.read_only &&
    shellSession.session.effective_permissions.includes(requiredPermission);

  if (!canUse) {
    return (
      <button
        type="button"
        className="min-h-11 w-full rounded-xl border border-border bg-secondary px-4 text-sm font-semibold text-muted-foreground"
        disabled
        title="Blocked by permission, tenant status, or offline state."
      >
        {label}
      </button>
    );
  }

  return (
    <ButtonLink href={href} className="w-full sm:w-auto">
      {label}
    </ButtonLink>
  );
}

const tenantStatusCopy: Record<
  AuthTenantStatus,
  { readonly title: string; readonly message: string; readonly className: string }
> = {
  pending_setup: {
    title: 'Setup required',
    message: 'Operational screens stay blocked until onboarding is complete.',
    className: 'border-warning bg-warning/10 text-foreground',
  },
  active: {
    title: 'Active',
    message: 'Normal access applies by permission and branch scope.',
    className: 'border-success bg-success/10 text-foreground',
  },
  grace_period: {
    title: 'Grace period',
    message: 'Renewal is due. Operational access still follows permissions and branch scope.',
    className: 'border-warning bg-warning/10 text-foreground',
  },
  read_only: {
    title: 'Read-only tenant',
    message:
      'Operational writes and settings changes are blocked except documented renewal or export actions.',
    className: 'border-border bg-secondary text-secondary-foreground',
  },
  suspended: {
    title: 'Tenant suspended',
    message: 'Operational access is blocked except documented owner renewal or export paths.',
    className: 'border-destructive bg-destructive/10 text-foreground',
  },
  pending_deletion: {
    title: 'Pending deletion',
    message: 'Tenant operational access is blocked.',
    className: 'border-destructive bg-destructive/10 text-foreground',
  },
  deleted: {
    title: 'Tenant unavailable',
    message: 'This tenant is no longer available.',
    className: 'border-destructive bg-destructive/10 text-foreground',
  },
};

export function createMockShellSession(): TenantShellSession {
  return {
    activeBranchId: 'branch-main',
    isOffline: false,
    session: {
      user: {
        id: 'user-demo-owner',
        user_type: 'tenant_user',
        full_name: 'Demo Owner',
        email: 'owner@example.test',
        email_verified: true,
        status: 'active',
      },
      tenant: {
        id: 'tenant-demo',
        business_name: 'Demo Motorcycle Shop',
        status: 'active',
        timezone: 'Asia/Manila',
        country: 'PH',
        currency: 'PHP',
      },
      effective_permissions: [
        'reports.view_basic',
        'branches.read',
        'branches.create',
        'users.read',
        'users.create',
        'roles.read',
        'roles.create',
        'customers.read',
        'customers.create',
      ],
      branches: [{ id: 'branch-main', name: 'Main Branch' }],
      tenant_wide_branch_access: true,
      effective_plan: {
        code: 'mid',
        name: 'Mid',
        limits: {
          max_active_branches: 3,
          customer_email_reminders: true,
          customer_sms_reminders: false,
        },
      },
      subscription: {
        status: 'active',
        expiration_date: null,
        days_until_expiration: null,
        renewal_required: false,
      },
      access: {
        can_access_operational_modules: true,
        read_only: false,
      },
    },
  };
}
