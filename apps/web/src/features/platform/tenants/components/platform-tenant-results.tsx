import Link from 'next/link';

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui';
import type { PlatformTenantListItem, PlatformTenantListState } from '../platform-tenant.types';

interface PlatformTenantResultsProps {
  readonly tenantListState: PlatformTenantListState;
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasActiveFilters: boolean;
  readonly hasMore: boolean;
  readonly canCreateTenant: boolean;
  readonly onLoadMore: () => void;
}

export function PlatformTenantResults({
  tenantListState,
  isInitialLoading,
  isLoadingMore,
  hasActiveFilters,
  hasMore,
  canCreateTenant,
  onLoadMore,
}: PlatformTenantResultsProps) {
  return (
    <div className="grid gap-4">
      {isInitialLoading ? <PlatformTenantListSkeleton /> : null}

      {tenantListState.status === 'error' ? (
        tenantListState.code === 'forbidden' ? (
          <PlatformTenantForbiddenState
            title="Platform tenant list blocked"
            requiredPermission="platform.tenants.read"
            description={tenantListState.message ?? 'The platform tenant list is blocked.'}
            detail={tenantListState.detail ?? null}
          />
        ) : (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{tenantListState.message}</p>
            {tenantListState.detail === null || tenantListState.detail === undefined ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tenantListState.detail}
              </p>
            )}
          </Alert>
        )
      ) : null}

      {!isInitialLoading &&
      tenantListState.status !== 'error' &&
      tenantListState.tenants.length === 0 ? (
        <PlatformTenantEmptyState
          title={hasActiveFilters ? 'No tenants match your filters' : 'No tenants found'}
          description={
            hasActiveFilters
              ? 'Adjust the search or status filter and try again.'
              : 'Create a platform-managed tenant when the shop is ready for setup.'
          }
          canCreateTenant={!hasActiveFilters && canCreateTenant}
        />
      ) : null}

      {tenantListState.tenants.length > 0 ? (
        <PlatformTenantTable tenants={tenantListState.tenants} />
      ) : null}

      {hasMore && tenantListState.status !== 'error' ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" disabled={isLoadingMore} onClick={onLoadMore}>
            {isLoadingMore ? 'Loading more tenants...' : 'Load more tenants'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformTenantForbiddenState({
  title,
  requiredPermission,
  description,
  detail,
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
        Required permission: <strong>{requiredPermission}</strong>.
      </p>
      {detail === null || detail === undefined ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </Alert>
  );
}

function PlatformTenantTable({ tenants }: { readonly tenants: readonly PlatformTenantListItem[] }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:hidden">
        {tenants.map((tenant) => (
          <PlatformTenantMobileCard key={tenant.id} tenant={tenant} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              <TableHead>Tenant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => {
              const tenantDetailHref = `/platform/tenants/${tenant.id}`;

              return (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <Link
                      href={tenantDetailHref}
                      className="font-bold text-foreground underline-offset-4 hover:underline"
                    >
                      {tenant.business_name}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tenant.shop_email ?? 'No shop email returned'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tenant.status} />
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {formatTenantPlan(tenant)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.subscription?.expiration_date ?? 'Expiration not returned'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTenantSetup(tenant)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ButtonLink href={tenantDetailHref} variant="secondary" size="sm">
                      View
                    </ButtonLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PlatformTenantMobileCard({ tenant }: { readonly tenant: PlatformTenantListItem }) {
  const tenantDetailHref = `/platform/tenants/${tenant.id}`;

  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={tenantDetailHref}
            className="break-words font-bold text-foreground underline-offset-4 hover:underline"
          >
            {tenant.business_name}
          </Link>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {tenant.shop_email ?? 'No shop email returned'}
          </p>
        </div>
        <StatusBadge status={tenant.status} />
      </div>

      <dl className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <div>
          <dt className="font-bold text-foreground">Plan</dt>
          <dd className="mt-1 text-muted-foreground">{formatTenantPlan(tenant)}</dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Expiration</dt>
          <dd className="mt-1 text-muted-foreground">
            {tenant.subscription?.expiration_date ?? 'Expiration not returned'}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Location</dt>
          <dd className="mt-1 text-muted-foreground">{formatTenantLocation(tenant)}</dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Setup</dt>
          <dd className="mt-1 text-muted-foreground">{formatTenantSetup(tenant)}</dd>
        </div>
      </dl>

      <ButtonLink href={tenantDetailHref} variant="secondary" size="sm">
        View tenant
      </ButtonLink>
    </article>
  );
}

function PlatformTenantListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function PlatformTenantEmptyState({
  title,
  description,
  canCreateTenant,
}: {
  readonly title: string;
  readonly description: string;
  readonly canCreateTenant: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-center">
      <h2 className="font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {canCreateTenant ? (
        <div className="mt-4 flex justify-center">
          <ButtonLink href="/platform/tenants/new" variant="primary" size="sm">
            Create tenant
          </ButtonLink>
        </div>
      ) : null}
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

function formatTenantPlan(tenant: PlatformTenantListItem): string {
  return (
    tenant.subscription?.plan_name ??
    tenant.plan?.name ??
    tenant.subscription?.plan_code ??
    tenant.plan?.code ??
    'Plan not returned'
  );
}

function formatTenantSetup(tenant: PlatformTenantListItem): string {
  if (tenant.onboarding_completed_at !== null && tenant.onboarding_completed_at !== undefined) {
    return 'Complete';
  }

  if (tenant.status === 'pending_setup') {
    return 'Pending setup';
  }

  return 'Not returned';
}

function formatTenantLocation(tenant: PlatformTenantListItem): string {
  const timezone = tenant.timezone ?? 'Timezone not returned';
  const country = tenant.country ?? 'Country not returned';
  const currency = tenant.currency ?? 'Currency not returned';

  return `${timezone} · ${country} · ${currency}`;
}
