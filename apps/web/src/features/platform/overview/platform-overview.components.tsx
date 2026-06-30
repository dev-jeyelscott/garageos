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
} from '../../../components/ui';
import type { AuthTenantStatus } from '../../auth/types/auth-session';

import type {
  PlatformAttentionItem,
  PlatformOverviewPermissions,
  PlatformTenantStatusCounts,
} from './platform-overview.types';

export function PlatformOverviewSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-live="polite">
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

export function SubscriptionHealthCard({
  statusSummary,
  loadedTenantCount,
}: {
  readonly statusSummary: PlatformTenantStatusCounts;
  readonly loadedTenantCount: number;
}) {
  const rows: readonly {
    readonly status: AuthTenantStatus;
    readonly label: string;
    readonly description: string;
  }[] = [
    {
      status: 'active',
      label: 'Active',
      description: 'Full access based on permissions and branch scope.',
    },
    {
      status: 'grace_period',
      label: 'Grace period',
      description: 'Full access continues with renewal warnings.',
    },
    {
      status: 'read_only',
      label: 'Read only',
      description: 'Operational writes are blocked.',
    },
    {
      status: 'suspended',
      label: 'Suspended',
      description: 'Owner renewal/export only; non-owner users blocked.',
    },
    {
      status: 'pending_deletion',
      label: 'Pending deletion',
      description: 'Tenant is queued for deletion lifecycle handling.',
    },
    {
      status: 'pending_setup',
      label: 'Setup not finished',
      description: 'Operational modules remain blocked until onboarding is complete.',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription health</CardTitle>
        <CardDescription>Lifecycle status summary from loaded tenant records.</CardDescription>
      </CardHeader>
      <CardContent>
        {loadedTenantCount === 0 ? (
          <EmptyState
            title="No tenant status data"
            description="No tenants are visible in the current platform overview."
          />
        ) : (
          <ul className="grid gap-3">
            {rows.map((row) => {
              const count = statusSummary[row.status];
              const percentage =
                loadedTenantCount === 0 ? 0 : Math.round((count / loadedTenantCount) * 100);

              return (
                <li
                  key={row.status}
                  className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} />
                      <span className="text-sm font-bold text-foreground">{row.label}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {row.description}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xl font-black text-foreground">{count}</p>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {percentage}%
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PlatformAttentionNeededCard({
  items,
}: {
  readonly items: readonly PlatformAttentionItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Tenants needing action</CardTitle>
            <CardDescription>Source-aligned lifecycle and setup blockers.</CardDescription>
          </div>
          <ButtonLink href="/platform/tenants" variant="secondary" size="sm">
            View all
          </ButtonLink>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="No tenants need action"
            description="There are no visible tenants in grace period, read-only, suspended, pending deletion, or pending setup status."
          />
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li
                key={item.tenant.id}
                className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-foreground">{item.tenant.business_name}</p>
                    <StatusBadge status={item.tenant.status} />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.tenant.shop_email ?? 'Shop email not returned'}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
                    <p>
                      <strong className="text-foreground">Issue:</strong> {item.issue}
                    </p>
                    <p>
                      <strong className="text-foreground">Recommended action:</strong>{' '}
                      {item.recommendedAction}
                    </p>
                  </div>
                </div>
                <ButtonLink
                  href={`/platform/tenants/${item.tenant.id}`}
                  variant="secondary"
                  size="sm"
                >
                  Open tenant
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentPlatformActivityCard({
  canReadAuditLogs,
}: {
  readonly canReadAuditLogs: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Planned activity feed</CardTitle>
            <CardDescription>
              This placeholder stays inactive until a dashboard activity feed is backed by
              documented APIs.
            </CardDescription>
          </div>
          {canReadAuditLogs ? (
            <ButtonLink href="/platform/audit-logs" variant="secondary" size="sm">
              View audit logs
            </ButtonLink>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled>
              No audit access
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {canReadAuditLogs ? (
          <EmptyState
            title="Activity feed planned placeholder"
            description="Do not render synthetic activity. Wire this card only when a documented platform activity or audit-backed dashboard API is available."
          />
        ) : (
          <ForbiddenState
            title="Recent activity unavailable"
            requiredPermission="platform.audit_logs.read"
            description="Your platform session cannot view platform audit activity."
          />
        )}
      </CardContent>
    </Card>
  );
}

export function PlatformQuickActionsCard({
  permissions,
}: {
  readonly permissions: PlatformOverviewPermissions;
}) {
  const actions = [
    {
      title: 'Create tenant',
      description: 'Add a tenant after subscription details are known.',
      href: '/platform/tenants/new',
      enabled: permissions.canCreateTenant,
      disabledReason: 'Requires platform.tenants.create.',
    },
    {
      title: 'Review tenants',
      description: 'Open tenant lifecycle and subscription status.',
      href: '/platform/tenants',
      enabled: permissions.canReadTenants,
      disabledReason: 'Requires platform.tenants.read.',
    },
    {
      title: 'View audit logs',
      description: 'Review platform audit events.',
      href: '/platform/audit-logs',
      enabled: permissions.canReadAuditLogs,
      disabledReason: 'Requires platform.audit_logs.read.',
    },
    {
      title: 'Start support access',
      description: 'Open a tenant detail page and start explicit support access.',
      href: '/platform/tenants',
      enabled: permissions.canStartSupportAccess && permissions.canReadTenants,
      disabledReason: 'Requires platform.support_access and platform.tenants.read.',
    },
    {
      title: 'Manage plans',
      description: 'Plan management route remains planned until API support is available.',
      href: null,
      enabled: false,
      disabledReason: permissions.canManagePlans
        ? 'Route is planned until platform plan APIs are implemented.'
        : 'Requires platform.plans.update.',
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Only documented platform actions are shown.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {actions.map((action) => (
            <li key={action.title}>
              {action.enabled && action.href !== null ? (
                <ButtonLink
                  href={action.href}
                  variant={action.title === 'Create tenant' ? 'primary' : 'secondary'}
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

export function SupportAccessPolicyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Support access policy</CardTitle>
        <CardDescription>
          Tenant troubleshooting must be explicit, time-bound, and audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <p className="text-sm leading-6 text-muted-foreground">
            Platform admins must not silently impersonate tenant users. Support access requires a
            tenant, reason, mode, expiration, and backend audit log.
          </p>
        </Alert>

        <ul className="grid gap-3 text-sm text-muted-foreground">
          <ChecklistItem label="Record a clear support reason before opening tenant data." />
          <ChecklistItem label="Use read-only mode unless write access is explicitly selected and permitted." />
          <ChecklistItem label="Keep support access visible, time-bound, and audited." />
        </ul>
      </CardContent>
    </Card>
  );
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

export function EmptyState({
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

function getStatusBadgeVariant(status: string): BadgeVariant {
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
