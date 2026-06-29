'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  postAuthJson,
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
  readonly updated_by_platform_admin_user_id?: string | null;
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

interface PlatformTenantSubscriptionForm {
  readonly plan_id: string;
  readonly subscription_start_date: string;
  readonly subscription_expiration_date: string;
  readonly reason: string;
}

interface UpdatePlatformTenantSubscriptionResponse {
  readonly subscription: PlatformTenantSubscriptionSummary;
}

type PlatformTenantSubscriptionSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

interface PlatformTenantReadOnlyOverrideForm {
  readonly reason: string;
  readonly expires_at: string;
}

interface PlatformTenantSuspensionForm {
  readonly reason: string;
  readonly expires_at: string;
}

type PlatformTenantReadOnlyOverrideSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

type PlatformTenantSuspensionSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

interface ApplyPlatformTenantReadOnlyOverrideResponse {
  readonly tenant?: PlatformTenantDetail;
}

interface ApplyPlatformTenantSuspensionResponse {
  readonly tenant?: PlatformTenantDetail;
}

interface PlatformTenantCreateForm {
  readonly business_name: string;
  readonly shop_email: string;
  readonly plan_id: string;
  readonly subscription_start_date: string;
  readonly subscription_expiration_date: string;
  readonly owner_full_name: string;
  readonly owner_email: string;
  readonly approve_duplicate: boolean;
  readonly duplicate_approval_reason: string;
}

interface CreatePlatformTenantResponse {
  readonly tenant: {
    readonly id: string;
    readonly business_name: string;
    readonly status: 'pending_setup';
  };
  readonly subscription: PlatformTenantSubscriptionSummary;
  readonly owner_invitation_sent: boolean;
}

type PlatformTenantCreateSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
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

const defaultPlatformTenantCreateForm: PlatformTenantCreateForm = {
  business_name: '',
  shop_email: '',
  plan_id: '',
  subscription_start_date: '',
  subscription_expiration_date: '',
  owner_full_name: '',
  owner_email: '',
  approve_duplicate: false,
  duplicate_approval_reason: '',
};

const defaultPlatformTenantSubscriptionForm: PlatformTenantSubscriptionForm = {
  plan_id: '',
  subscription_start_date: '',
  subscription_expiration_date: '',
  reason: '',
};

const defaultPlatformTenantReadOnlyOverrideForm: PlatformTenantReadOnlyOverrideForm = {
  reason: '',
  expires_at: '',
};

const defaultPlatformTenantSuspensionForm: PlatformTenantSuspensionForm = {
  reason: '',
  expires_at: '',
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

  const canCreateTenant =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.create');

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

export function PlatformTenantCreateScreen() {
  const router = useRouter();
  const sessionState = useProtectedSession('platform');
  const [form, setForm] = useState<PlatformTenantCreateForm>(defaultPlatformTenantCreateForm);
  const [submitState, setSubmitState] = useState<PlatformTenantCreateSubmitState>({
    status: 'idle',
  });

  const canCreateTenant =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.create');

  function updateFormField<K extends keyof PlatformTenantCreateForm>(
    field: K,
    value: PlatformTenantCreateForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateTenantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateTenant || submitState.status === 'submitting') {
      return;
    }

    setSubmitState({ status: 'submitting' });

    try {
      const response = await createPlatformTenant(form);
      router.push(`/platform/tenants/${response.tenant.id}`);
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to create platform tenant.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const isSubmitting = submitState.status === 'submitting';
  const fieldErrors = submitState.status === 'error' ? submitState.fieldErrors : {};

  return (
    <AuthenticatedShell
      area="platform"
      session={sessionState.session}
      title="Create Tenant"
      eyebrow="Platform administration"
      description="Create a platform-managed tenant with an assigned plan, subscription dates, and a shop owner invitation."
      actions={
        <ButtonLink href="/platform/tenants" variant="secondary">
          Back to tenants
        </ButtonLink>
      }
    >
      {!canCreateTenant ? (
        <ForbiddenState
          title="Platform tenant creation unavailable"
          requiredPermission="platform.tenants.create"
          description="Your platform session does not include permission to create tenant records."
        />
      ) : (
        <>
          <Alert>
            <p className="text-sm leading-6">
              This screen wires only the documented platform-created tenant flow. It creates a
              pending-setup tenant, assigns the selected plan ID and subscription dates, and sends a
              shop owner invitation. Subscription overrides, support access, exports, deletion jobs,
              and platform audit log search remain separate workflow slices.
            </p>
          </Alert>

          {submitState.status === 'error' ? (
            <Alert variant="destructive">
              <p className="text-sm font-bold">{submitState.message}</p>
              {submitState.detail === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
              )}
              {submitState.code === 'duplicate_resource' ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  A matching non-deleted tenant already exists. Review the tenant carefully before
                  enabling duplicate approval and providing an approval reason.
                </p>
              ) : null}
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Tenant setup</CardTitle>
              <CardDescription>
                Enter the tenant identity, subscription baseline, and owner invitation details
                required by the platform tenant creation API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-6" onSubmit={handleCreateTenantSubmit}>
                <fieldset
                  className="grid gap-6 disabled:pointer-events-none disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                    <div>
                      <h2 className="font-bold text-foreground">Business information</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Tenant identity fields are used for duplicate detection and platform
                        administration.
                      </p>
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-foreground">Business name</span>
                      <Input
                        value={form.business_name}
                        onChange={(event) =>
                          updateFormField('business_name', event.currentTarget.value)
                        }
                        required
                        maxLength={200}
                        placeholder="Example Moto Garage"
                      />
                      <FieldError message={fieldErrors.business_name} />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-foreground">Shop email</span>
                      <Input
                        type="email"
                        value={form.shop_email}
                        onChange={(event) =>
                          updateFormField('shop_email', event.currentTarget.value)
                        }
                        required
                        placeholder="owner@example.com"
                      />
                      <FieldError message={fieldErrors.shop_email} />
                    </label>
                  </section>

                  <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                    <div>
                      <h2 className="font-bold text-foreground">Subscription baseline</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Use an active Basic, Mid, or High plan ID. A plan selector should replace
                        this field when the platform plan management/list API is wired.
                      </p>
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-foreground">Plan ID</span>
                      <Input
                        value={form.plan_id}
                        onChange={(event) => updateFormField('plan_id', event.currentTarget.value)}
                        required
                        placeholder="UUID of an active subscription plan"
                      />
                      <FieldError message={fieldErrors.plan_id} />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-foreground">
                          Subscription start date
                        </span>
                        <Input
                          type="date"
                          value={form.subscription_start_date}
                          onChange={(event) =>
                            updateFormField('subscription_start_date', event.currentTarget.value)
                          }
                          required
                        />
                        <FieldError message={fieldErrors.subscription_start_date} />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-foreground">
                          Subscription expiration date
                        </span>
                        <Input
                          type="date"
                          value={form.subscription_expiration_date}
                          onChange={(event) =>
                            updateFormField(
                              'subscription_expiration_date',
                              event.currentTarget.value,
                            )
                          }
                          required
                        />
                        <FieldError message={fieldErrors.subscription_expiration_date} />
                      </label>
                    </div>
                  </section>

                  <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                    <div>
                      <h2 className="font-bold text-foreground">Shop owner invitation</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        The current backend contract creates a single-use owner invitation for the
                        tenant. Temporary plaintext passwords are not displayed.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-foreground">Owner full name</span>
                        <Input
                          value={form.owner_full_name}
                          onChange={(event) =>
                            updateFormField('owner_full_name', event.currentTarget.value)
                          }
                          required
                          maxLength={200}
                          placeholder="Juan Dela Cruz"
                        />
                        <FieldError
                          message={fieldErrors.owner_full_name ?? fieldErrors['owner.full_name']}
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-foreground">Owner email</span>
                        <Input
                          type="email"
                          value={form.owner_email}
                          onChange={(event) =>
                            updateFormField('owner_email', event.currentTarget.value)
                          }
                          required
                          placeholder="owner@example.com"
                        />
                        <FieldError
                          message={fieldErrors.owner_email ?? fieldErrors['owner.email']}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                    <div>
                      <h2 className="font-bold text-foreground">Duplicate approval</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Use this only when a platform admin intentionally approves a tenant with the
                        same normalized business name and shop email combination.
                      </p>
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                      <input
                        type="checkbox"
                        checked={form.approve_duplicate}
                        onChange={(event) =>
                          updateFormField('approve_duplicate', event.currentTarget.checked)
                        }
                        className="mt-1 h-5 w-5 rounded border border-input"
                      />
                      <span>
                        <span className="block text-sm font-bold text-foreground">
                          Approve duplicate tenant
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                          Requires a clear reason and will be audited by the backend.
                        </span>
                      </span>
                    </label>
                    <FieldError message={fieldErrors.approve_duplicate} />

                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-foreground">
                        Duplicate approval reason
                      </span>
                      <textarea
                        value={form.duplicate_approval_reason}
                        onChange={(event) =>
                          updateFormField('duplicate_approval_reason', event.currentTarget.value)
                        }
                        required={form.approve_duplicate}
                        disabled={!form.approve_duplicate || isSubmitting}
                        maxLength={500}
                        rows={4}
                        className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="Reason for approving the duplicate tenant..."
                      />
                      <FieldError message={fieldErrors.duplicate_approval_reason} />
                    </label>
                  </section>
                </fieldset>

                <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <ButtonLink href="/platform/tenants" variant="secondary">
                    Cancel
                  </ButtonLink>
                  <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating tenant...' : 'Create tenant and invite owner'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </AuthenticatedShell>
  );
}

export function PlatformTenantDetailScreen({ tenantId }: { readonly tenantId: string }) {
  const sessionState = useProtectedSession('platform');
  const [tenantDetailState, setTenantDetailState] = useState<PlatformTenantDetailState>({
    status: 'idle',
  });
  const [subscriptionForm, setSubscriptionForm] = useState<PlatformTenantSubscriptionForm>(
    defaultPlatformTenantSubscriptionForm,
  );
  const [subscriptionSubmitState, setSubscriptionSubmitState] =
    useState<PlatformTenantSubscriptionSubmitState>({
      status: 'idle',
    });

  const [readOnlyOverrideForm, setReadOnlyOverrideForm] =
    useState<PlatformTenantReadOnlyOverrideForm>(defaultPlatformTenantReadOnlyOverrideForm);
  const [readOnlyOverrideSubmitState, setReadOnlyOverrideSubmitState] =
    useState<PlatformTenantReadOnlyOverrideSubmitState>({
      status: 'idle',
    });

  const [tenantSuspensionForm, setTenantSuspensionForm] = useState<PlatformTenantSuspensionForm>(
    defaultPlatformTenantSuspensionForm,
  );
  const [tenantSuspensionSubmitState, setTenantSuspensionSubmitState] =
    useState<PlatformTenantSuspensionSubmitState>({
      status: 'idle',
    });

  const canReadTenantDetail =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.read');

  const canUpdateSubscription =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.subscriptions.update');

  useEffect(() => {
    if (sessionState.status !== 'ready' || !canReadTenantDetail || tenantId.length === 0) {
      return;
    }

    let active = true;

    async function loadTenantDetail() {
      setTenantDetailState({ status: 'loading' });
      setSubscriptionSubmitState({ status: 'idle' });
      setReadOnlyOverrideSubmitState({ status: 'idle' });
      setTenantSuspensionSubmitState({ status: 'idle' });

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

  useEffect(() => {
    if (tenantDetailState.status !== 'loaded') {
      return;
    }

    setSubscriptionForm(createPlatformTenantSubscriptionFormFromTenant(tenantDetailState.tenant));
  }, [tenantDetailState]);

  function updateSubscriptionFormField<K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) {
    setSubscriptionForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      subscriptionSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantSubscriptionForm = {
      plan_id: subscriptionForm.plan_id.trim(),
      subscription_start_date: subscriptionForm.subscription_start_date,
      subscription_expiration_date: subscriptionForm.subscription_expiration_date,
      reason: subscriptionForm.reason.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.plan_id.length === 0) {
      fieldErrors.plan_id = 'Plan ID is required.';
    }

    if (nextForm.subscription_start_date.length === 0) {
      fieldErrors.subscription_start_date = 'Subscription start date is required.';
    }

    if (nextForm.subscription_expiration_date.length === 0) {
      fieldErrors.subscription_expiration_date = 'Subscription expiration date is required.';
    }

    if (
      nextForm.subscription_start_date.length > 0 &&
      nextForm.subscription_expiration_date.length > 0 &&
      nextForm.subscription_expiration_date < nextForm.subscription_start_date
    ) {
      fieldErrors.subscription_expiration_date =
        'Subscription expiration date must be on or after start date.';
    }

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSubscriptionSubmitState({
        status: 'error',
        message: 'Review the subscription update fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSubscriptionSubmitState({ status: 'submitting' });

    try {
      await updatePlatformTenantSubscription(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setSubscriptionSubmitState({
        status: 'success',
        message: 'Tenant subscription was updated and the detail view was refreshed.',
      });
    } catch (error) {
      setSubscriptionSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to update tenant subscription.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateReadOnlyOverrideFormField<K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) {
    setReadOnlyOverrideForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantReadOnlyOverrideSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      readOnlyOverrideSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantReadOnlyOverrideForm = {
      reason: readOnlyOverrideForm.reason.trim(),
      expires_at: readOnlyOverrideForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length > 0 && Number.isNaN(Date.parse(nextForm.expires_at))) {
      fieldErrors.expires_at = 'Expiry must be a valid date and time.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setReadOnlyOverrideSubmitState({
        status: 'error',
        message: 'Review the read-only override fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setReadOnlyOverrideSubmitState({ status: 'submitting' });

    try {
      await applyPlatformTenantReadOnlyOverride(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setReadOnlyOverrideForm(defaultPlatformTenantReadOnlyOverrideForm);
      setReadOnlyOverrideSubmitState({
        status: 'success',
        message: 'Read-only override was applied and the tenant detail view was refreshed.',
      });
    } catch (error) {
      setReadOnlyOverrideSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to apply tenant read-only override.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  function updateTenantSuspensionFormField<K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) {
    setTenantSuspensionForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantSuspensionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      tenantSuspensionSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantSuspensionForm = {
      reason: tenantSuspensionForm.reason.trim(),
      expires_at: tenantSuspensionForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length > 0 && Number.isNaN(Date.parse(nextForm.expires_at))) {
      fieldErrors.expires_at = 'Expiry must be a valid date and time.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantSuspensionSubmitState({
        status: 'error',
        message: 'Review the suspension fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantSuspensionSubmitState({ status: 'submitting' });

    try {
      await applyPlatformTenantSuspension(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setTenantSuspensionForm(defaultPlatformTenantSuspensionForm);
      setTenantSuspensionSubmitState({
        status: 'success',
        message: 'Tenant suspension was applied and the tenant detail view was refreshed.',
      });
    } catch (error) {
      setTenantSuspensionSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to apply tenant suspension.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  const isLoadingTenant =
    tenantDetailState.status === 'idle' || tenantDetailState.status === 'loading';
  const subscriptionFieldErrors =
    subscriptionSubmitState.status === 'error' ? subscriptionSubmitState.fieldErrors : {};

  const readOnlyOverrideFieldErrors =
    readOnlyOverrideSubmitState.status === 'error' ? readOnlyOverrideSubmitState.fieldErrors : {};

  const tenantSuspensionFieldErrors =
    tenantSuspensionSubmitState.status === 'error' ? tenantSuspensionSubmitState.fieldErrors : {};

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
          {canUpdateSubscription && tenantDetailState.status === 'loaded' ? (
            <>
              <ButtonLink href="#tenant-subscription-management" variant="primary">
                Manage subscription
              </ButtonLink>
              <ButtonLink href="#tenant-read-only-override" variant="secondary">
                Apply read-only
              </ButtonLink>
              <ButtonLink href="#tenant-suspension" variant="destructive">
                Suspend tenant
              </ButtonLink>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled
                title={
                  canUpdateSubscription
                    ? 'Tenant detail must load before subscription updates.'
                    : 'Requires platform.subscriptions.update.'
                }
              >
                Manage subscription
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled
                title={
                  canUpdateSubscription
                    ? 'Tenant detail must load before read-only override.'
                    : 'Requires platform.subscriptions.update.'
                }
              >
                Apply read-only
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled
                title={
                  canUpdateSubscription
                    ? 'Tenant detail must load before suspension.'
                    : 'Requires platform.subscriptions.update.'
                }
              >
                Suspend tenant
              </Button>
            </>
          )}
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
              This screen reads platform tenant detail and now wires the documented subscription
              management, read-only override, and suspension workflows. Support access, exports,
              deletion jobs, and platform audit logs remain separate workflow slices.
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
                    Current subscription summary returned by the platform tenant detail API.
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
                  <KeyValue
                    label="Updated by platform admin"
                    value={
                      tenantDetailState.tenant.subscription?.updated_by_platform_admin_user_id ??
                      'Not returned'
                    }
                  />
                  <KeyValue
                    label="Subscription updated"
                    value={tenantDetailState.tenant.subscription?.updated_at ?? 'Not returned'}
                  />
                </CardContent>
              </Card>

              <PlatformTenantSubscriptionManagementPanel
                tenant={tenantDetailState.tenant}
                canUpdateSubscription={canUpdateSubscription}
                form={subscriptionForm}
                submitState={subscriptionSubmitState}
                fieldErrors={subscriptionFieldErrors}
                onChange={updateSubscriptionFormField}
                onSubmit={handleTenantSubscriptionSubmit}
              />

              <PlatformTenantReadOnlyOverridePanel
                tenant={tenantDetailState.tenant}
                canUpdateSubscription={canUpdateSubscription}
                form={readOnlyOverrideForm}
                submitState={readOnlyOverrideSubmitState}
                fieldErrors={readOnlyOverrideFieldErrors}
                onChange={updateReadOnlyOverrideFormField}
                onSubmit={handleTenantReadOnlyOverrideSubmit}
              />

              <PlatformTenantSuspensionPanel
                tenant={tenantDetailState.tenant}
                canUpdateSubscription={canUpdateSubscription}
                form={tenantSuspensionForm}
                submitState={tenantSuspensionSubmitState}
                fieldErrors={tenantSuspensionFieldErrors}
                onChange={updateTenantSuspensionFormField}
                onSubmit={handleTenantSuspensionSubmit}
              />

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

              <div className="grid gap-4 lg:grid-cols-3">
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

  const envelope = await getAuthJsonEnvelope<unknown>(`/platform/tenants?${params.toString()}`, {
    accessToken,
  });

  return normalizePlatformTenantListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizePlatformTenantPagination(envelope.meta.pagination),
  });
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

async function createPlatformTenant(
  form: PlatformTenantCreateForm,
): Promise<CreatePlatformTenantResponse> {
  const duplicateApprovalReason = form.duplicate_approval_reason.trim();

  return postAuthJson<CreatePlatformTenantResponse>(
    '/platform/tenants',
    {
      business_name: form.business_name.trim(),
      shop_email: form.shop_email.trim(),
      plan_id: form.plan_id.trim(),
      subscription_start_date: form.subscription_start_date,
      subscription_expiration_date: form.subscription_expiration_date,
      owner: {
        full_name: form.owner_full_name.trim(),
        email: form.owner_email.trim(),
        send_invitation: true,
      },
      ...(form.approve_duplicate
        ? {
            approve_duplicate: true,
            duplicate_approval_reason: duplicateApprovalReason,
          }
        : {}),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-create'),
    },
  );
}

function normalizePlatformTenantListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: PlatformTenantListPagination | null;
  },
): PlatformTenantListResult {
  if (Array.isArray(data) && data.every(isPlatformTenantListItem)) {
    return {
      tenants: data,
      pagination: meta.pagination,
    };
  }

  if (
    isObjectRecord(data) &&
    Array.isArray(data.tenants) &&
    data.tenants.every(isPlatformTenantListItem)
  ) {
    return {
      tenants: data.tenants,
      pagination: normalizePlatformTenantPagination(data.pagination) ?? meta.pagination,
    };
  }

  throw toInvalidTenantListResponseError(meta);
}

async function updatePlatformTenantSubscription(
  tenantId: string,
  form: PlatformTenantSubscriptionForm,
): Promise<UpdatePlatformTenantSubscriptionResponse> {
  return postAuthJson<UpdatePlatformTenantSubscriptionResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/subscription`,
    {
      plan_id: form.plan_id.trim(),
      subscription_start_date: form.subscription_start_date,
      subscription_expiration_date: form.subscription_expiration_date,
      reason: form.reason.trim(),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-subscription-update'),
    },
  );
}

async function applyPlatformTenantReadOnlyOverride(
  tenantId: string,
  form: PlatformTenantReadOnlyOverrideForm,
): Promise<ApplyPlatformTenantReadOnlyOverrideResponse> {
  const expiresAt = toOptionalIsoTimestamp(form.expires_at);

  return postAuthJson<ApplyPlatformTenantReadOnlyOverrideResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/read-only`,
    {
      reason: form.reason.trim(),
      ...(expiresAt === null
        ? {}
        : {
            expires_at: expiresAt,
          }),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-read-only-override'),
    },
  );
}

async function applyPlatformTenantSuspension(
  tenantId: string,
  form: PlatformTenantSuspensionForm,
): Promise<ApplyPlatformTenantSuspensionResponse> {
  const expiresAt = toOptionalIsoTimestamp(form.expires_at);

  return postAuthJson<ApplyPlatformTenantSuspensionResponse>(
    `/platform/tenants/${encodeURIComponent(tenantId)}/suspend`,
    {
      reason: form.reason.trim(),
      ...(expiresAt === null
        ? {}
        : {
            expires_at: expiresAt,
          }),
    },
    {
      requiresAuth: true,
      idempotencyKey: createIdempotencyKey('platform-tenant-suspension'),
    },
  );
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

function createPlatformTenantSubscriptionFormFromTenant(
  tenant: PlatformTenantDetail,
): PlatformTenantSubscriptionForm {
  return {
    plan_id: tenant.subscription?.plan_id ?? tenant.plan?.id ?? '',
    subscription_start_date: tenant.subscription?.start_date ?? '',
    subscription_expiration_date: tenant.subscription?.expiration_date ?? '',
    reason: '',
  };
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

function PlatformTenantSubscriptionManagementPanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantSubscriptionForm;
  readonly submitState: PlatformTenantSubscriptionSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const currentPlanId = tenant.subscription?.plan_id ?? tenant.plan?.id ?? 'Not returned';
  const currentStartDate = tenant.subscription?.start_date ?? 'Not returned';
  const currentExpirationDate = tenant.subscription?.expiration_date ?? 'Not returned';

  return (
    <Card id="tenant-subscription-management">
      <CardHeader>
        <CardTitle>Subscription management</CardTitle>
        <CardDescription>
          Update the tenant plan ID and subscription dates after external payment confirmation or
          platform subscription correction. A reason is required for auditability.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Current plan ID" value={currentPlanId} />
          <KeyValue label="Current start date" value={currentStartDate} />
          <KeyValue label="Current expiration date" value={currentExpirationDate} />
        </div>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Subscription update unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant subscription data, but it cannot submit
              subscription updates. Required permission:{' '}
              <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Subscription updated</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Subscription update fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use an active Basic, Mid, or High plan ID. The platform plan selector remains a
                  separate plan-management slice.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Plan ID</span>
                <Input
                  value={form.plan_id}
                  onChange={(event) => onChange('plan_id', event.currentTarget.value)}
                  required
                  placeholder="UUID of an active subscription plan"
                />
                <FieldError message={fieldErrors.plan_id} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Subscription start date</span>
                  <Input
                    type="date"
                    value={form.subscription_start_date}
                    onChange={(event) =>
                      onChange('subscription_start_date', event.currentTarget.value)
                    }
                    required
                  />
                  <FieldError message={fieldErrors.subscription_start_date} />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Subscription expiration date
                  </span>
                  <Input
                    type="date"
                    value={form.subscription_expiration_date}
                    onChange={(event) =>
                      onChange('subscription_expiration_date', event.currentTarget.value)
                    }
                    required
                  />
                  <FieldError message={fieldErrors.subscription_expiration_date} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External subscription payment confirmed for renewal."
                />
                <FieldError message={fieldErrors.reason} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Updating subscription...' : 'Update subscription'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantReadOnlyOverridePanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantReadOnlyOverrideForm;
  readonly submitState: PlatformTenantReadOnlyOverrideSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';

  return (
    <Card id="tenant-read-only-override">
      <CardHeader>
        <CardTitle>Read-only override</CardTitle>
        <CardDescription>
          Force the tenant into read-only mode through the documented platform override workflow. A
          reason is required for auditability. Expiry is optional when the override is temporary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <KeyValue label="Current tenant status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Optional expiry behavior"
            value="Leave blank for an open-ended platform override"
          />
        </div>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Read-only override unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant lifecycle data, but it cannot apply read-only
              overrides. Required permission: <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Read-only override applied</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Override fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This does not process payment or suspend the tenant. It only applies the
                  documented read-only override and relies on backend authorization as
                  authoritative.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External billing issue requires temporary read-only access."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Optional expiry</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Optional. When provided, the frontend sends it to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Applying read-only override...' : 'Apply read-only override'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantSuspensionPanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantSuspensionForm;
  readonly submitState: PlatformTenantSuspensionSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';

  return (
    <Card id="tenant-suspension">
      <CardHeader>
        <CardTitle>Tenant suspension</CardTitle>
        <CardDescription>
          Suspend tenant operational access through the documented platform override workflow. A
          reason is required for auditability. Expiry is optional when the suspension is temporary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <KeyValue label="Current tenant status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Suspension effect"
            value="Shop Owner renewal/export only; non-owner access blocked"
          />
        </div>

        <Alert variant="destructive">
          <p className="text-sm font-bold">High-impact tenant lifecycle action</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Suspension blocks operational access for tenant users. The backend remains authoritative
            for lifecycle enforcement and audit logging.
          </p>
        </Alert>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Tenant suspension unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant lifecycle data, but it cannot suspend tenants.
              Required permission: <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant suspended</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Suspension fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This does not process payment, create support access, trigger export, or queue
                  deletion. It only applies the documented suspension override.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External subscription non-payment confirmed after grace and read-only period."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Optional expiry</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Optional. When provided, the frontend sends it to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="destructive"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Suspending tenant...' : 'Suspend tenant'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined || message.length === 0) {
    return null;
  }

  return <p className="text-sm font-semibold text-destructive">{message}</p>;
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
  pagination: unknown,
): PlatformTenantListPagination | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : platformTenantListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : platformTenantListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
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
    message: 'The platform tenant list response did not contain a valid tenant list payload.',
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

function isPlatformTenantListItem(value: unknown): value is PlatformTenantListItem {
  return isPlatformTenantDetail(value);
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

function createIdempotencyKey(prefix: string): string {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomId}`;
}

function toOptionalIsoTimestamp(value: string): string | null {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  return new Date(normalizedValue).toISOString();
}

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!isApiClientError(error)) {
    return {};
  }

  return error.details.reduce<Record<string, string>>((fieldErrors, detail) => {
    if (typeof detail.field === 'string' && typeof detail.message === 'string') {
      fieldErrors[detail.field] = detail.message;
    }

    return fieldErrors;
  }, {});
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
  const pathname = usePathname();
  const navItems = area === 'platform' ? platformNavItems : tenantNavItems;
  const networkStatus = useNetworkStatus();
  const isPlatform = area === 'platform';

  return (
    <main
      className={
        isPlatform
          ? 'min-h-dvh bg-background text-foreground'
          : 'min-h-dvh bg-background pb-24 text-foreground md:pb-0'
      }
    >
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <AppBrandLink area={area} session={session} />

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {area === 'tenant' ? <BranchContextBadge session={session} /> : null}
              <StatusBadge
                status={session.tenant?.status}
                fallback={area === 'platform' ? 'platform' : 'unknown'}
              />
              <Badge className="max-w-[12rem] truncate">{session.user.full_name}</Badge>
              <ButtonLink href="/auth/logout" variant="ghost" size="sm">
                Logout
              </ButtonLink>
            </div>
          </div>

          <ShellNavigation area={area} navItems={navItems} pathname={pathname} />
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
          <>
            <TenantStatusBanner session={session} />
            <OfflineBanner networkStatus={networkStatus} />
          </>
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

      {area === 'tenant' ? (
        <MobileTenantNavigation navItems={tenantNavItems} pathname={pathname} />
      ) : null}
    </main>
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
      href={area === 'platform' ? '/platform/tenants' : '/dashboard'}
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
        <span className="mt-1 block max-w-[13rem] truncate text-xs font-semibold text-muted-foreground sm:max-w-[18rem]">
          {area === 'platform' ? 'Platform Admin' : (session.tenant?.business_name ?? 'Tenant')}
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
