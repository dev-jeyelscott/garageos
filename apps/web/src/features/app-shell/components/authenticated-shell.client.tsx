'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

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
} from '../../../components/ui';
import {
  getAccessTokenOrRefresh,
  getAuthJson,
  getAuthJsonEnvelope,
} from '../../auth/actions/login.action';
import { getCurrentSession } from '../../auth/queries/get-current-session.query';
import type { AuthSessionResponseData, AuthTenantStatus } from '../../auth/types/auth-session';
import {
  isTenantBlockedStatus,
  resolveAuthenticatedRedirect,
} from '../../auth/utils/resolve-auth-redirect';
import { isApiClientError, type ApiClientError } from '../../../lib/api-envelope';

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

type PlatformSubscriptionStatusSource = 'system_computed' | 'platform_override';

type PlatformTenantStatusFilter = 'all' | AuthTenantStatus;

interface PlatformTenantPlanSummary {
  readonly id?: string | null;
  readonly code?: string | null;
  readonly name?: string | null;
}

interface PlatformTenantSubscriptionSummary {
  readonly plan_id?: string | null;
  readonly plan_code?: string | null;
  readonly plan_name?: string | null;
  readonly start_date?: string | null;
  readonly expiration_date?: string | null;
  readonly status_source?: PlatformSubscriptionStatusSource | string | null;
  readonly last_renewal_at?: string | null;
  readonly updated_at?: string | null;
}

interface PlatformTenantListItem {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email?: string | null;
  readonly status: AuthTenantStatus;
  readonly timezone?: string | null;
  readonly country?: string | null;
  readonly currency?: string | null;
  readonly onboarding_completed_at?: string | null;
  readonly plan?: PlatformTenantPlanSummary | null;
  readonly subscription?: PlatformTenantSubscriptionSummary | null;
}

interface PlatformTenantDetail {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email?: string | null;
  readonly status: AuthTenantStatus;
  readonly timezone?: string | null;
  readonly country?: string | null;
  readonly currency?: string | null;
  readonly onboarding_completed_at?: string | null;
  readonly deletion_scheduled_for?: string | null;
  readonly deleted_at?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly plan?: PlatformTenantPlanSummary | null;
  readonly subscription?: PlatformTenantSubscriptionSummary | null;
}

type PlatformTenantDetailState =
  | {
      readonly status: 'idle' | 'loading';
    }
  | {
      readonly status: 'loaded';
      readonly tenant: PlatformTenantDetail;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

interface PlatformTenantListFilters {
  readonly q: string;
  readonly status: PlatformTenantStatusFilter;
}

interface PlatformTenantListPagination {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

interface PlatformTenantListResult {
  readonly tenants: readonly PlatformTenantListItem[];
  readonly pagination: PlatformTenantListPagination | null;
}

interface PlatformTenantListState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'loading_more' | 'error';
  readonly tenants: readonly PlatformTenantListItem[];
  readonly pagination: PlatformTenantListPagination | null;
  readonly message?: string;
  readonly detail?: string | null;
  readonly code?: string | null;
}

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

const platformTenantListPageSize = 50;

const defaultPlatformTenantListFilters: PlatformTenantListFilters = {
  q: '',
  status: 'all',
};

const tenantStatusFilterOptions: readonly {
  readonly value: PlatformTenantStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_setup', label: 'Pending setup' },
  { value: 'active', label: 'Active' },
  { value: 'grace_period', label: 'Grace period' },
  { value: 'read_only', label: 'Read-only' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_deletion', label: 'Pending deletion' },
  { value: 'deleted', label: 'Deleted' },
];

export function PlatformTenantsScreen() {
  const sessionState = useProtectedSession('platform');
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<PlatformTenantStatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<PlatformTenantListFilters>(
    defaultPlatformTenantListFilters,
  );
  const [tenantListState, setTenantListState] = useState<PlatformTenantListState>({
    status: 'idle',
    tenants: [],
    pagination: null,
  });

  const canReadTenantList =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.read');

  useEffect(() => {
    if (sessionState.status !== 'ready' || !canReadTenantList) {
      return;
    }

    let active = true;

    async function loadInitialTenants() {
      setTenantListState({
        status: 'loading',
        tenants: [],
        pagination: null,
      });

      try {
        const result = await getPlatformTenants({
          filters: appliedFilters,
          limit: platformTenantListPageSize,
        });

        if (!active) {
          return;
        }

        setTenantListState({
          status: 'loaded',
          tenants: result.tenants,
          pagination: result.pagination,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setTenantListState({
          status: 'error',
          tenants: [],
          pagination: null,
          message: toSafeErrorMessage(error, 'Unable to load platform tenants.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadInitialTenants();

    return () => {
      active = false;
    };
  }, [appliedFilters, canReadTenantList, sessionState]);

  async function handleLoadMore() {
    const nextCursor = tenantListState.pagination?.next_cursor ?? null;

    if (nextCursor === null || tenantListState.status === 'loading_more') {
      return;
    }

    setTenantListState((current) => ({
      ...current,
      status: 'loading_more',
    }));

    try {
      const result = await getPlatformTenants({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: platformTenantListPageSize,
      });

      setTenantListState((current) => ({
        status: 'loaded',
        tenants: [...current.tenants, ...result.tenants],
        pagination: result.pagination,
      }));
    } catch (error) {
      setTenantListState((current) => ({
        status: 'error',
        tenants: current.tenants,
        pagination: current.pagination,
        message: toSafeErrorMessage(error, 'Unable to load more platform tenants.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      }));
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      q: searchDraft.trim(),
      status: statusDraft,
    });
  }

  function handleResetFilters() {
    setSearchDraft('');
    setStatusDraft('all');
    setAppliedFilters(defaultPlatformTenantListFilters);
  }

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const isInitialLoading =
    tenantListState.status === 'idle' || tenantListState.status === 'loading';
  const isLoadingMore = tenantListState.status === 'loading_more';
  const hasMore =
    tenantListState.pagination?.has_more === true &&
    tenantListState.pagination.next_cursor !== null;
  const hasActiveFilters = appliedFilters.q.length > 0 || appliedFilters.status !== 'all';

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
          title="Create tenant route is planned after the tenant list contract wiring."
        >
          Create tenant
        </Button>
      }
    >
      {!canReadTenantList ? (
        <ForbiddenState
          title="Platform tenant list unavailable"
          requiredPermission="platform.tenants.read"
          description="Your platform session does not include permission to view tenant records."
        />
      ) : (
        <>
          <Alert>
            <p className="text-sm leading-6">
              This screen reads the documented platform tenant list only. Tenant creation,
              subscription overrides, support access, exports, deletion jobs, and audit logs remain
              separate documented workflows.
            </p>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Tenant list</CardTitle>
              <CardDescription>
                Search and filter tenants through the platform list API. Cursor pagination is read
                from the API response metadata.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form
                className="grid gap-3 lg:grid-cols-[1fr_16rem_auto_auto] lg:items-end"
                onSubmit={handleFilterSubmit}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Search tenants</span>
                  <Input
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.currentTarget.value)}
                    placeholder="Business name, email, timezone..."
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Status</span>
                  <select
                    value={statusDraft}
                    onChange={(event) =>
                      setStatusDraft(event.currentTarget.value as PlatformTenantStatusFilter)
                    }
                    disabled={isInitialLoading || isLoadingMore}
                    className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tenantStatusFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <Button type="submit" disabled={isInitialLoading || isLoadingMore}>
                  Apply filters
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={isInitialLoading || isLoadingMore}
                  onClick={handleResetFilters}
                >
                  Reset
                </Button>
              </form>

              {hasActiveFilters ? (
                <Alert>
                  <p className="text-sm leading-6">
                    Active filters:{' '}
                    <strong>{appliedFilters.q.length > 0 ? appliedFilters.q : 'No search'}</strong>
                    {' · '}
                    <strong>{formatTenantStatusFilter(appliedFilters.status)}</strong>
                  </p>
                </Alert>
              ) : null}

              <div className="grid gap-4">
                {isInitialLoading ? <TenantListSkeleton /> : null}

                {tenantListState.status === 'error' ? (
                  tenantListState.code === 'forbidden' ? (
                    <ForbiddenState
                      title="Platform tenant list blocked"
                      requiredPermission="platform.tenants.read"
                      description={
                        tenantListState.message ?? 'The platform tenant list is blocked.'
                      }
                      detail={tenantListState.detail ?? null}
                    />
                  ) : (
                    <Alert variant="destructive">
                      <p className="text-sm font-bold">{tenantListState.message}</p>
                      {tenantListState.detail === null ||
                      tenantListState.detail === undefined ? null : (
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
                  <EmptyState
                    title={
                      hasActiveFilters ? 'No tenants match the filters' : 'No tenants returned'
                    }
                    description={
                      hasActiveFilters
                        ? 'Adjust the search or status filter and try again.'
                        : 'The platform tenant list endpoint returned an empty list.'
                    }
                  />
                ) : null}

                {tenantListState.tenants.length > 0 ? (
                  <PlatformTenantTable tenants={tenantListState.tenants} />
                ) : null}

                {hasMore && tenantListState.status !== 'error' ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isLoadingMore}
                      onClick={() => void handleLoadMore()}
                    >
                      {isLoadingMore ? 'Loading more tenants...' : 'Load more tenants'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      )}
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

export function PlatformTenantDetailScreen({ tenantId }: { readonly tenantId: string }) {
  const sessionState = useProtectedSession('platform');
  const [tenantDetailState, setTenantDetailState] = useState<PlatformTenantDetailState>({
    status: 'idle',
  });

  const canReadTenantDetail =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.read');

  useEffect(() => {
    if (sessionState.status !== 'ready' || !canReadTenantDetail || tenantId.length === 0) {
      return;
    }

    let active = true;

    async function loadTenantDetail() {
      setTenantDetailState({ status: 'loading' });

      try {
        const tenant = await getPlatformTenantDetail(tenantId);

        if (!active) {
          return;
        }

        setTenantDetailState({
          status: 'loaded',
          tenant,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setTenantDetailState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load platform tenant detail.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadTenantDetail();

    return () => {
      active = false;
    };
  }, [canReadTenantDetail, sessionState, tenantId]);

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const isLoadingTenant =
    tenantDetailState.status === 'idle' || tenantDetailState.status === 'loading';

  return (
    <AuthenticatedShell
      area="platform"
      session={sessionState.session}
      title="Tenant Detail"
      eyebrow="Platform administration"
      description="Read tenant metadata, lifecycle state, and subscription status without entering support access."
      actions={
        <>
          <ButtonLink href="/platform/tenants" variant="secondary">
            Back to tenants
          </ButtonLink>
          <Button
            type="button"
            variant="secondary"
            disabled
            title="Planned subscription workflow route."
          >
            Manage subscription
          </Button>
        </>
      }
    >
      {!canReadTenantDetail ? (
        <ForbiddenState
          title="Platform tenant detail unavailable"
          requiredPermission="platform.tenants.read"
          description="Your platform session does not include permission to view tenant records."
        />
      ) : (
        <>
          <Alert>
            <p className="text-sm leading-6">
              This screen reads the documented platform tenant detail only. Subscription changes,
              read-only override, suspension, support access, exports, deletion jobs, and platform
              audit logs remain separate workflow slices.
            </p>
          </Alert>

          {isLoadingTenant ? <TenantDetailSkeleton /> : null}

          {tenantDetailState.status === 'error' ? (
            tenantDetailState.code === 'forbidden' ? (
              <ForbiddenState
                title="Platform tenant detail blocked"
                requiredPermission="platform.tenants.read"
                description={tenantDetailState.message}
                detail={tenantDetailState.detail}
              />
            ) : (
              <Alert variant="destructive">
                <p className="text-sm font-bold">{tenantDetailState.message}</p>
                {tenantDetailState.detail === null ? null : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {tenantDetailState.detail}
                  </p>
                )}
              </Alert>
            )
          ) : null}

          {tenantDetailState.status === 'loaded' ? (
            <div className="grid gap-5">
              <div className="grid gap-4 lg:grid-cols-4">
                <SummaryCard
                  title="Tenant status"
                  value={formatTenantStatus(tenantDetailState.tenant.status)}
                  description="Lifecycle access remains backend-authoritative."
                />
                <SummaryCard
                  title="Plan"
                  value={formatTenantPlan(tenantDetailState.tenant)}
                  description={`Source: ${
                    tenantDetailState.tenant.subscription?.status_source ?? 'Not returned'
                  }`}
                />
                <SummaryCard
                  title="Expiration"
                  value={tenantDetailState.tenant.subscription?.expiration_date ?? 'Not returned'}
                  description="Subscription lifecycle dates are interpreted by the backend."
                />
                <SummaryCard
                  title="Onboarding"
                  value={
                    tenantDetailState.tenant.onboarding_completed_at === null ||
                    tenantDetailState.tenant.onboarding_completed_at === undefined
                      ? 'Incomplete or not returned'
                      : 'Completed'
                  }
                  description={
                    tenantDetailState.tenant.onboarding_completed_at ??
                    'Completion timestamp not returned'
                  }
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Tenant metadata</CardTitle>
                  <CardDescription>
                    Platform-visible tenant identity and localization fields from the tenant detail
                    API.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <KeyValue label="Tenant ID" value={tenantDetailState.tenant.id} />
                  <KeyValue label="Business name" value={tenantDetailState.tenant.business_name} />
                  <KeyValue
                    label="Shop email"
                    value={tenantDetailState.tenant.shop_email ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Timezone / Country / Currency"
                    value={formatTenantLocation(tenantDetailState.tenant)}
                  />
                  <KeyValue
                    label="Created"
                    value={tenantDetailState.tenant.created_at ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Last updated"
                    value={tenantDetailState.tenant.updated_at ?? 'Not returned'}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscription detail</CardTitle>
                  <CardDescription>
                    Read-only subscription summary returned by the platform tenant detail API.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <KeyValue
                    label="Plan ID"
                    value={
                      tenantDetailState.tenant.subscription?.plan_id ??
                      tenantDetailState.tenant.plan?.id ??
                      'Not returned'
                    }
                  />
                  <KeyValue label="Plan name" value={formatTenantPlan(tenantDetailState.tenant)} />
                  <KeyValue
                    label="Start date"
                    value={tenantDetailState.tenant.subscription?.start_date ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Expiration date"
                    value={tenantDetailState.tenant.subscription?.expiration_date ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Status source"
                    value={tenantDetailState.tenant.subscription?.status_source ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Last renewal"
                    value={tenantDetailState.tenant.subscription?.last_renewal_at ?? 'Not returned'}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lifecycle detail</CardTitle>
                  <CardDescription>
                    Read-only lifecycle fields used for platform operations and deletion safeguards.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <KeyValue
                    label="Current status"
                    value={formatTenantStatus(tenantDetailState.tenant.status)}
                  />
                  <KeyValue
                    label="Onboarding completed"
                    value={tenantDetailState.tenant.onboarding_completed_at ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Deletion scheduled for"
                    value={tenantDetailState.tenant.deletion_scheduled_for ?? 'Not returned'}
                  />
                  <KeyValue
                    label="Deleted at"
                    value={tenantDetailState.tenant.deleted_at ?? 'Not returned'}
                  />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <PlannedWorkflowCard
                  title="Subscription management"
                  requiredPermission="platform.subscriptions.update"
                  description="Assigning plans, expiration dates, and status overrides belongs to the dedicated subscription workflow."
                />
                <PlannedWorkflowCard
                  title="Support access"
                  requiredPermission="platform.support_access"
                  description="Audited support access must require reason, mode, expiration, and a visible support marker."
                />
                <PlannedWorkflowCard
                  title="Tenant export"
                  requiredPermission="platform.tenants.update"
                  description="Tenant export remains a separate async job workflow."
                />
                <PlannedWorkflowCard
                  title="Deletion job"
                  requiredPermission="platform.tenants.update"
                  description="Deletion queueing requires eligibility checks and a dedicated confirmation workflow."
                />
              </div>
            </div>
          ) : null}
        </>
      )}
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

async function getPlatformTenants({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: PlatformTenantListFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<PlatformTenantListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  if (filters.q.length > 0) {
    params.set('q', filters.q);
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<readonly PlatformTenantListItem[]>(
    `/platform/tenants?${params.toString()}`,
    {
      accessToken,
    },
  );

  if (!Array.isArray(envelope.data)) {
    throw toInvalidTenantListResponseError({
      requestId: readMetaString(envelope.meta.request_id),
      correlationId: readMetaString(envelope.meta.correlation_id),
    });
  }

  return {
    tenants: envelope.data,
    pagination: normalizePlatformTenantPagination(envelope.meta.pagination),
  };
}

async function getPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetail> {
  const accessToken = await getAccessTokenOrRefresh();

  const envelope = await getAuthJsonEnvelope<unknown>(
    `/platform/tenants/${encodeURIComponent(tenantId)}`,
    {
      accessToken,
    },
  );

  return normalizePlatformTenantDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

function normalizePlatformTenantDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): PlatformTenantDetail {
  if (isPlatformTenantDetail(data)) {
    return data;
  }

  if (isObjectRecord(data) && isPlatformTenantDetail(data.tenant)) {
    return data.tenant;
  }

  throw toInvalidTenantDetailResponseError(meta);
}

function PlatformTenantTable({ tenants }: { readonly tenants: readonly PlatformTenantListItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="hidden grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] gap-4 border-b border-border bg-muted px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground md:grid">
        <span>Tenant</span>
        <span>Status</span>
        <span>Plan</span>
        <span>Expiration</span>
        <span>Action</span>
      </div>

      <ul className="divide-y divide-border">
        {tenants.map((tenant) => {
          const tenantDetailHref = `/platform/tenants/${tenant.id}`;

          return (
            <li
              key={tenant.id}
              className="grid gap-3 bg-card p-4 md:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] md:items-center"
            >
              <div>
                <Link
                  href={tenantDetailHref}
                  className="font-bold text-foreground underline-offset-4 hover:underline"
                >
                  {tenant.business_name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tenant.shop_email ?? 'No shop email returned'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{formatTenantLocation(tenant)}</p>
              </div>

              <div>
                <StatusBadge status={tenant.status} />
              </div>

              <p className="text-sm font-semibold text-foreground">{formatTenantPlan(tenant)}</p>

              <p className="text-sm text-muted-foreground">
                {tenant.subscription?.expiration_date ?? 'Expiration not returned'}
              </p>

              <div>
                <ButtonLink href={tenantDetailHref} variant="secondary" size="sm">
                  View
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TenantDetailSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 lg:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4">
      <dt className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold leading-6 text-foreground">{value}</dd>
    </div>
  );
}

function PlannedWorkflowCard({
  title,
  requiredPermission,
  description,
}: {
  readonly title: string;
  readonly requiredPermission: string;
  readonly description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <p className="text-sm font-bold">Planned workflow</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Required permission: <strong>{requiredPermission}</strong>. This action remains disabled
            in this read-only detail slice.
          </p>
        </Alert>
      </CardContent>
    </Card>
  );
}

function ForbiddenState({
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

function normalizePlatformTenantPagination(
  pagination: PlatformTenantListPagination | undefined,
): PlatformTenantListPagination | null {
  if (pagination === undefined) {
    return null;
  }

  return {
    limit: pagination.limit,
    next_cursor: pagination.next_cursor ?? null,
    has_more: pagination.has_more,
  };
}

function toInvalidTenantListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The platform tenant list response did not contain an array data payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidTenantDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The platform tenant detail response did not contain a tenant detail payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function isPlatformTenantDetail(value: unknown): value is PlatformTenantDetail {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.business_name === 'string' &&
    isTenantStatus(value.status)
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTenantStatus(value: unknown): value is AuthTenantStatus {
  return (
    value === 'pending_setup' ||
    value === 'active' ||
    value === 'grace_period' ||
    value === 'read_only' ||
    value === 'suspended' ||
    value === 'pending_deletion' ||
    value === 'deleted'
  );
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

function formatTenantStatusFilter(status: PlatformTenantStatusFilter): string {
  return status === 'all' ? 'All statuses' : formatTenantStatus(status);
}

function formatTenantPlan(tenant: PlatformTenantListItem): string {
  return (
    tenant.subscription?.plan_name ??
    tenant.plan?.name ??
    tenant.subscription?.plan_code?.toUpperCase() ??
    tenant.plan?.code?.toUpperCase() ??
    'Plan not returned'
  );
}

function formatTenantLocation(tenant: PlatformTenantListItem): string {
  const locationParts = [tenant.timezone, tenant.country, tenant.currency].filter(
    (part): part is string => part !== null && part !== undefined && part.length > 0,
  );

  return locationParts.length === 0 ? 'Timezone not returned' : locationParts.join(' · ');
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
