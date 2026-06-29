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
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
import { getPlatformAuditLogs } from '../../platform/audit-logs/platform-audit-log.api';
import {
  defaultPlatformAuditLogListFilters,
  platformAuditLogListPageSize,
} from '../../platform/audit-logs/platform-audit-log.defaults';
import type {
  PlatformAuditLogListFilters,
  PlatformAuditLogListItem,
  PlatformAuditLogListState,
} from '../../platform/audit-logs/platform-audit-log.types';
import {
  defaultPlatformSupportAccessEndForm,
  defaultPlatformSupportAccessForm,
  defaultPlatformTenantCreateForm,
  defaultPlatformTenantDeletionJobForm,
  defaultPlatformTenantExportForm,
  defaultPlatformTenantListFilters,
  defaultPlatformTenantReadOnlyOverrideForm,
  defaultPlatformTenantSubscriptionForm,
  defaultPlatformTenantSuspensionForm,
  platformTenantListPageSize,
  tenantStatusFilterOptions,
} from '../../platform/tenants/platform-tenant.defaults';
import {
  applyPlatformTenantReadOnlyOverride,
  applyPlatformTenantSuspension,
  createPlatformTenant,
  endPlatformSupportAccessSession,
  getPlatformTenantDetail,
  getPlatformTenants,
  queuePlatformTenantDeletionJob,
  queuePlatformTenantExport,
  startPlatformSupportAccessSession,
  updatePlatformTenantSubscription,
} from '../../platform/tenants/platform-tenant.api';
import type {
  PlatformSupportAccessEndForm,
  PlatformSupportAccessEndSubmitState,
  PlatformSupportAccessForm,
  PlatformSupportAccessMode,
  PlatformSupportAccessSubmitState,
  PlatformTenantCreateForm,
  PlatformTenantCreateSubmitState,
  PlatformTenantDeletionJobForm,
  PlatformTenantDeletionJobSubmitState,
  PlatformTenantDetail,
  PlatformTenantDetailState,
  PlatformTenantExportForm,
  PlatformTenantExportSubmitState,
  PlatformTenantListFilters,
  PlatformTenantListItem,
  PlatformTenantListState,
  PlatformTenantReadOnlyOverrideForm,
  PlatformTenantReadOnlyOverrideSubmitState,
  PlatformTenantStatusFilter,
  PlatformTenantSubscriptionForm,
  PlatformTenantSubscriptionSubmitState,
  PlatformTenantSuspensionForm,
  PlatformTenantSuspensionSubmitState,
} from '../../platform/tenants/platform-tenant.types';

export function PlatformOverviewScreen() {
  const sessionState = useProtectedSession('platform');

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const { session } = sessionState;

  const platformModules = [
    {
      title: 'Tenants',
      href: '/platform/tenants',
      status: 'active',
      requiredPermission: 'platform.tenants.read',
      description:
        'Search tenants, review lifecycle status, and open tenant-specific administration workflows.',
    },
    {
      title: 'Create Tenant',
      href: '/platform/tenants/new',
      status: 'active',
      requiredPermission: 'platform.tenants.create',
      description:
        'Create platform-managed tenants with subscription dates and owner invitation setup.',
    },
    {
      title: 'Plans',
      href: undefined,
      status: 'planned',
      requiredPermission: 'platform.plans.update',
      description:
        'Documented plan-management route for Basic, Mid, High limits and default plan settings.',
    },
    {
      title: 'Support Access',
      href: undefined,
      status: 'planned',
      requiredPermission: 'platform.support_access',
      description:
        'Tenant-specific audited support access is available from tenant detail; aggregate session list remains planned.',
    },
    {
      title: 'Exports',
      href: undefined,
      status: 'planned',
      requiredPermission: 'platform.tenants.update',
      description:
        'Tenant export queueing is available from tenant detail; aggregate export status route remains planned.',
    },
    {
      title: 'Deletion Jobs',
      href: undefined,
      status: 'planned',
      requiredPermission: 'platform.tenants.update',
      description:
        'Deletion job visibility remains planned until deletion eligibility and job list APIs are wired.',
    },
    {
      title: 'Audit Logs',
      href: '/platform/audit-logs',
      status: 'active',
      requiredPermission: 'platform.audit_logs.read',
      description:
        'Search platform audit logs by actor, action, tenant, and date range through the documented read API.',
    },
    {
      title: 'Platform Settings',
      href: undefined,
      status: 'planned',
      requiredPermission: 'platform.tenants.update',
      description: 'Only documented and API-backed platform settings should be added here.',
    },
  ] as const;

  const enabledModules = platformModules.filter(
    (module) =>
      module.href !== undefined && hasEffectivePermission(session, module.requiredPermission),
  );

  return (
    <AuthenticatedShell
      area="platform"
      session={session}
      title="Platform Admin"
      eyebrow="Platform workspace"
      description="Operational command center for GarageOS tenant lifecycle, subscriptions, support access, exports, deletion jobs, plans, and audit visibility."
      actions={
        <>
          <ButtonLink href="/platform/tenants" variant="secondary">
            View tenants
          </ButtonLink>
          {hasEffectivePermission(session, 'platform.tenants.create') ? (
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
          )}
        </>
      }
    >
      <Alert>
        <p className="text-sm font-bold">Source-aligned dashboard foundation</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This overview does not invent platform metrics or unsupported aggregate APIs. It exposes
          documented module entry points and planned states only.
        </p>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Enabled modules"
          value={String(enabledModules.length)}
          description="Counts only linked modules that are available to your current platform permissions."
        />
        <SummaryCard
          title="Platform permissions"
          value={String(
            session.effective_permissions.filter((permission) => permission.startsWith('platform.'))
              .length,
          )}
          description="Platform permissions are separate from tenant role permissions."
        />
        <SummaryCard
          title="Support access"
          value="Explicit only"
          description="Tenant troubleshooting must use audited support access. Silent impersonation is not allowed."
        />
        <SummaryCard
          title="Workspace width"
          value="Full"
          description="Platform pages now use a full-width operations layout instead of a narrow centered page."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform modules</CardTitle>
          <CardDescription>
            Enabled links open implemented route foundations. Planned modules remain disabled until
            their source-aligned APIs and screens are implemented.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformModules.map((module) => {
              const hasPermission = hasEffectivePermission(session, module.requiredPermission);
              const isAvailable = module.href !== undefined && hasPermission;

              return (
                <section
                  key={module.title}
                  className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-foreground">{module.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                    <StatusBadge
                      status={isAvailable ? module.status : hasPermission ? 'planned' : 'forbidden'}
                    />
                  </div>

                  <p className="text-xs font-bold text-muted-foreground">
                    Required permission: {module.requiredPermission}
                  </p>

                  {isAvailable ? (
                    <ButtonLink href={module.href} variant="secondary" size="sm">
                      Open
                    </ButtonLink>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled
                      title={
                        hasPermission
                          ? 'Route is planned and not yet wired.'
                          : `Requires ${module.requiredPermission}.`
                      }
                    >
                      {hasPermission ? 'Planned' : 'No access'}
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </AuthenticatedShell>
  );
}

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

export function PlatformAuditLogsScreen() {
  const sessionState = useProtectedSession('platform');
  const [filterDraft, setFilterDraft] = useState<PlatformAuditLogListFilters>(
    defaultPlatformAuditLogListFilters,
  );
  const [appliedFilters, setAppliedFilters] = useState<PlatformAuditLogListFilters>(
    defaultPlatformAuditLogListFilters,
  );
  const [auditLogState, setAuditLogState] = useState<PlatformAuditLogListState>({
    status: 'idle',
    auditLogs: [],
    pagination: null,
  });

  const canReadAuditLogs =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.audit_logs.read');

  useEffect(() => {
    if (sessionState.status !== 'ready' || !canReadAuditLogs) {
      return;
    }

    let active = true;

    async function loadInitialAuditLogs() {
      setAuditLogState({
        status: 'loading',
        auditLogs: [],
        pagination: null,
      });

      try {
        const result = await getPlatformAuditLogs({
          filters: appliedFilters,
          limit: platformAuditLogListPageSize,
        });

        if (!active) {
          return;
        }

        setAuditLogState({
          status: 'loaded',
          auditLogs: result.audit_logs,
          pagination: result.pagination,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setAuditLogState({
          status: 'error',
          auditLogs: [],
          pagination: null,
          message: toSafeErrorMessage(error, 'Unable to load platform audit logs.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadInitialAuditLogs();

    return () => {
      active = false;
    };
  }, [appliedFilters, canReadAuditLogs, sessionState.status]);

  function updateFilterDraft<K extends keyof PlatformAuditLogListFilters>(
    field: K,
    value: PlatformAuditLogListFilters[K],
  ) {
    setFilterDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      platform_admin_user_id: filterDraft.platform_admin_user_id.trim(),
      action: filterDraft.action.trim(),
      tenant_id: filterDraft.tenant_id.trim(),
      from: filterDraft.from,
      to: filterDraft.to,
    });
  }

  function handleResetFilters() {
    setFilterDraft(defaultPlatformAuditLogListFilters);
    setAppliedFilters(defaultPlatformAuditLogListFilters);
  }

  async function handleLoadMore() {
    const nextCursor = auditLogState.pagination?.next_cursor ?? null;

    if (nextCursor === null || auditLogState.status === 'loading_more') {
      return;
    }

    setAuditLogState((current) => ({
      ...current,
      status: 'loading_more',
    }));

    try {
      const result = await getPlatformAuditLogs({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: platformAuditLogListPageSize,
      });

      setAuditLogState((current) => ({
        status: 'loaded',
        auditLogs: [...current.auditLogs, ...result.audit_logs],
        pagination: result.pagination,
      }));
    } catch (error) {
      setAuditLogState((current) => ({
        status: 'error',
        auditLogs: current.auditLogs,
        pagination: current.pagination,
        message: toSafeErrorMessage(error, 'Unable to load more platform audit logs.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      }));
    }
  }

  if (sessionState.status !== 'ready') {
    return <SessionStateScreen state={sessionState} area="platform" />;
  }

  const isInitialLoading = auditLogState.status === 'idle' || auditLogState.status === 'loading';
  const isLoadingMore = auditLogState.status === 'loading_more';
  const hasMore =
    auditLogState.pagination?.has_more === true && auditLogState.pagination.next_cursor !== null;
  const hasActiveFilters = Object.values(appliedFilters).some((value) => value.length > 0);

  return (
    <AuthenticatedShell
      area="platform"
      session={sessionState.session}
      title="Platform Audit Logs"
      eyebrow="Platform administration"
      description="Search platform-level audit events without exposing sensitive payloads or entering tenant support access."
      actions={
        <ButtonLink href="/platform" variant="secondary">
          Back to platform
        </ButtonLink>
      }
    >
      {!canReadAuditLogs ? (
        <ForbiddenState
          title="Platform audit logs unavailable"
          requiredPermission="platform.audit_logs.read"
          description="Your platform session does not include permission to view platform audit logs."
        />
      ) : (
        <>
          <Alert>
            <p className="text-sm leading-6">
              This is a read-only platform audit search screen. It uses actor, action, tenant, and
              date filters only. Sensitive metadata is redacted by the backend response.
            </p>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Audit log search</CardTitle>
              <CardDescription>
                Use narrow filters for high-volume audit trails. Results use cursor pagination from
                the platform audit log API.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form
                className="grid gap-3 lg:grid-cols-5 lg:items-end"
                onSubmit={handleFilterSubmit}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Actor admin ID</span>
                  <Input
                    value={filterDraft.platform_admin_user_id}
                    onChange={(event) =>
                      updateFilterDraft('platform_admin_user_id', event.currentTarget.value)
                    }
                    placeholder="Platform admin UUID"
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Action</span>
                  <Input
                    value={filterDraft.action}
                    onChange={(event) => updateFilterDraft('action', event.currentTarget.value)}
                    placeholder="platform.tenant_export.queued"
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Tenant ID</span>
                  <Input
                    value={filterDraft.tenant_id}
                    onChange={(event) => updateFilterDraft('tenant_id', event.currentTarget.value)}
                    placeholder="Tenant UUID"
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">From</span>
                  <Input
                    type="datetime-local"
                    value={filterDraft.from}
                    onChange={(event) => updateFilterDraft('from', event.currentTarget.value)}
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">To</span>
                  <Input
                    type="datetime-local"
                    value={filterDraft.to}
                    onChange={(event) => updateFilterDraft('to', event.currentTarget.value)}
                    disabled={isInitialLoading || isLoadingMore}
                  />
                </label>

                <div className="flex gap-3 lg:col-span-5 lg:justify-end">
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
                </div>
              </form>

              {hasActiveFilters ? (
                <Alert>
                  <p className="text-sm leading-6">
                    Active audit filters are applied. Reset filters to return to the latest platform
                    audit events.
                  </p>
                </Alert>
              ) : null}

              {isInitialLoading ? <TenantListSkeleton /> : null}

              {auditLogState.status === 'error' ? (
                auditLogState.code === 'forbidden' ? (
                  <ForbiddenState
                    title="Platform audit log search blocked"
                    requiredPermission="platform.audit_logs.read"
                    description={auditLogState.message ?? 'Platform audit log search is blocked.'}
                    detail={auditLogState.detail ?? null}
                  />
                ) : (
                  <Alert variant="destructive">
                    <p className="text-sm font-bold">{auditLogState.message}</p>
                    {auditLogState.detail === null || auditLogState.detail === undefined ? null : (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {auditLogState.detail}
                      </p>
                    )}
                  </Alert>
                )
              ) : null}

              {!isInitialLoading &&
              auditLogState.status !== 'error' &&
              auditLogState.auditLogs.length === 0 ? (
                <EmptyState
                  title={
                    hasActiveFilters ? 'No audit logs match the filters' : 'No audit logs returned'
                  }
                  description={
                    hasActiveFilters
                      ? 'Adjust the actor, action, tenant, or date filters and try again.'
                      : 'The platform audit log endpoint returned an empty list.'
                  }
                />
              ) : null}

              {auditLogState.auditLogs.length > 0 ? (
                <PlatformAuditLogResults auditLogs={auditLogState.auditLogs} />
              ) : null}

              {hasMore && auditLogState.status !== 'error' ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isLoadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    {isLoadingMore ? 'Loading more audit logs...' : 'Load more audit logs'}
                  </Button>
                </div>
              ) : null}
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

  const [supportAccessForm, setSupportAccessForm] = useState<PlatformSupportAccessForm>(
    defaultPlatformSupportAccessForm,
  );
  const [supportAccessSubmitState, setSupportAccessSubmitState] =
    useState<PlatformSupportAccessSubmitState>({
      status: 'idle',
    });

  const [supportAccessEndForm, setSupportAccessEndForm] = useState<PlatformSupportAccessEndForm>(
    defaultPlatformSupportAccessEndForm,
  );
  const [supportAccessEndSubmitState, setSupportAccessEndSubmitState] =
    useState<PlatformSupportAccessEndSubmitState>({
      status: 'idle',
    });

  const canReadTenantDetail =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.read');

  const canUpdateSubscription =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.subscriptions.update');

  const canStartSupportAccess =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.support_access');

  const canQueueTenantExport =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.update');

  const canQueueTenantDeletionJob =
    sessionState.status === 'ready' &&
    hasEffectivePermission(sessionState.session, 'platform.tenants.update');

  const [tenantExportForm, setTenantExportForm] = useState<PlatformTenantExportForm>(
    defaultPlatformTenantExportForm,
  );

  const [tenantExportSubmitState, setTenantExportSubmitState] =
    useState<PlatformTenantExportSubmitState>({
      status: 'idle',
    });

  const [tenantDeletionJobForm, setTenantDeletionJobForm] = useState<PlatformTenantDeletionJobForm>(
    defaultPlatformTenantDeletionJobForm,
  );

  const [tenantDeletionJobSubmitState, setTenantDeletionJobSubmitState] =
    useState<PlatformTenantDeletionJobSubmitState>({
      status: 'idle',
    });

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
      setSupportAccessSubmitState({ status: 'idle' });
      setSupportAccessEndSubmitState({ status: 'idle' });
      setTenantExportSubmitState({ status: 'idle' });
      setTenantDeletionJobSubmitState({ status: 'idle' });

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

  function updateSupportAccessFormField<K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) {
    setSupportAccessForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSupportAccessSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canStartSupportAccess ||
      supportAccessSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformSupportAccessForm = {
      mode: supportAccessForm.mode,
      reason: supportAccessForm.reason.trim(),
      expires_at: supportAccessForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};
    const parsedExpiry = Date.parse(nextForm.expires_at);

    if (nextForm.mode !== 'read_only' && nextForm.mode !== 'write_allowed') {
      fieldErrors.mode = 'Support access mode is required.';
    }

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length === 0) {
      fieldErrors.expires_at = 'Expiration is required.';
    } else if (Number.isNaN(parsedExpiry)) {
      fieldErrors.expires_at = 'Expiration must be a valid date and time.';
    } else if (parsedExpiry <= Date.now()) {
      fieldErrors.expires_at = 'Expiration must be in the future.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSupportAccessSubmitState({
        status: 'error',
        message: 'Review the support access fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSupportAccessSubmitState({ status: 'submitting' });

    try {
      const response = await startPlatformSupportAccessSession(tenantId, nextForm);

      setSupportAccessForm(defaultPlatformSupportAccessForm);
      setSupportAccessSubmitState({
        status: 'success',
        message:
          'Support access session was started. Keep this visible marker active while working in support context.',
        session: response.support_access_session,
      });
    } catch (error) {
      setSupportAccessSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to start support access session.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateSupportAccessEndFormField<K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) {
    setSupportAccessEndForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSupportAccessEndSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canStartSupportAccess || supportAccessEndSubmitState.status === 'submitting') {
      return;
    }

    const activeSupportAccessSession =
      supportAccessSubmitState.status === 'success' &&
      supportAccessSubmitState.session.ended_at === null
        ? supportAccessSubmitState.session
        : null;

    if (activeSupportAccessSession === null) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: 'No active support access session is available to end from this screen.',
        detail:
          'Start a support access session first, or reload once an active support-session list API is available.',
        code: 'workflow_transition_blocked',
        fieldErrors: {},
      });
      return;
    }

    const nextForm: PlatformSupportAccessEndForm = {
      reason: supportAccessEndForm.reason.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: 'Review the support access end fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSupportAccessEndSubmitState({ status: 'submitting' });

    try {
      const response = await endPlatformSupportAccessSession(
        activeSupportAccessSession.id,
        nextForm,
      );

      setSupportAccessEndForm(defaultPlatformSupportAccessEndForm);
      setSupportAccessEndSubmitState({
        status: 'success',
        message: 'Support access session was ended and the visible marker was updated.',
        session: response.support_access_session,
      });
      setSupportAccessSubmitState({
        status: 'success',
        message:
          'Support access session has ended. Start a new explicit session only if continued support work is required.',
        session: response.support_access_session,
      });
    } catch (error) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to end support access session.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateTenantExportFormField<K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) {
    setTenantExportForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantExportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canQueueTenantExport ||
      tenantExportSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantExportForm = {
      reason: tenantExportForm.reason.trim(),
      include_attachments: tenantExportForm.include_attachments,
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantExportSubmitState({
        status: 'error',
        message: 'Review the tenant export fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantExportSubmitState({ status: 'submitting' });

    try {
      const response = await queuePlatformTenantExport(tenantId, nextForm);

      setTenantExportForm(defaultPlatformTenantExportForm);
      setTenantExportSubmitState({
        status: 'success',
        message:
          'Tenant export job was queued. Full package generation and download links are completed by the export worker slice.',
        job: response.export_job,
      });
    } catch (error) {
      setTenantExportSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to queue tenant export.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateTenantDeletionJobFormField<K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) {
    setTenantDeletionJobForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantDeletionJobSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canQueueTenantDeletionJob ||
      tenantDeletionJobSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantDeletionJobForm = {
      reason: tenantDeletionJobForm.reason.trim(),
      confirmation: tenantDeletionJobForm.confirmation.trim(),
    };

    const fieldErrors: Record<string, string> = {};
    const expectedConfirmation = tenantDetailState.tenant.business_name;

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.confirmation !== expectedConfirmation) {
      fieldErrors.confirmation = `Type "${expectedConfirmation}" to confirm deletion job queueing.`;
    }

    if (tenantDetailState.tenant.status !== 'pending_deletion') {
      fieldErrors.confirmation =
        'Tenant must be pending deletion before a deletion job can be queued.';
    }

    if (
      tenantDetailState.tenant.deletion_scheduled_for === null ||
      tenantDetailState.tenant.deletion_scheduled_for === undefined
    ) {
      fieldErrors.confirmation =
        'Tenant must have deletion_scheduled_for before a deletion job can be queued.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantDeletionJobSubmitState({
        status: 'error',
        message: 'Review the tenant deletion job fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantDeletionJobSubmitState({ status: 'submitting' });

    try {
      const response = await queuePlatformTenantDeletionJob(tenantId, nextForm);

      setTenantDeletionJobForm(defaultPlatformTenantDeletionJobForm);
      setTenantDeletionJobSubmitState({
        status: 'success',
        message:
          'Tenant deletion job was queued. Permanent deletion execution remains handled by the tenant deletion worker slice.',
        job: response.deletion_job,
      });
    } catch (error) {
      setTenantDeletionJobSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to queue tenant deletion job.'),
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

  const supportAccessFieldErrors =
    supportAccessSubmitState.status === 'error' ? supportAccessSubmitState.fieldErrors : {};

  const supportAccessEndFieldErrors =
    supportAccessEndSubmitState.status === 'error' ? supportAccessEndSubmitState.fieldErrors : {};

  const tenantExportFieldErrors =
    tenantExportSubmitState.status === 'error' ? tenantExportSubmitState.fieldErrors : {};

  const tenantDeletionJobFieldErrors =
    tenantDeletionJobSubmitState.status === 'error' ? tenantDeletionJobSubmitState.fieldErrors : {};

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

          {tenantDetailState.status === 'loaded' ? (
            <ButtonLink href="#tenant-detail-tabs" variant="primary">
              Review sections
            </ButtonLink>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled
              title="Tenant detail must load before section review."
            >
              Review sections
            </Button>
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
              management, read-only override, suspension, support access session, tenant export job
              trigger, and tenant deletion job queueing workflows. Plan management, platform audit
              logs, and full export packaging remain separate workflow slices.
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
            <PlatformTenantDetailTabs
              tenant={tenantDetailState.tenant}
              canUpdateSubscription={canUpdateSubscription}
              canStartSupportAccess={canStartSupportAccess}
              canQueueTenantExport={canQueueTenantExport}
              canQueueTenantDeletionJob={canQueueTenantDeletionJob}
              subscriptionForm={subscriptionForm}
              subscriptionSubmitState={subscriptionSubmitState}
              subscriptionFieldErrors={subscriptionFieldErrors}
              onSubscriptionChange={updateSubscriptionFormField}
              onSubscriptionSubmit={handleTenantSubscriptionSubmit}
              readOnlyOverrideForm={readOnlyOverrideForm}
              readOnlyOverrideSubmitState={readOnlyOverrideSubmitState}
              readOnlyOverrideFieldErrors={readOnlyOverrideFieldErrors}
              onReadOnlyOverrideChange={updateReadOnlyOverrideFormField}
              onReadOnlyOverrideSubmit={handleTenantReadOnlyOverrideSubmit}
              tenantSuspensionForm={tenantSuspensionForm}
              tenantSuspensionSubmitState={tenantSuspensionSubmitState}
              tenantSuspensionFieldErrors={tenantSuspensionFieldErrors}
              onTenantSuspensionChange={updateTenantSuspensionFormField}
              onTenantSuspensionSubmit={handleTenantSuspensionSubmit}
              supportAccessForm={supportAccessForm}
              supportAccessSubmitState={supportAccessSubmitState}
              supportAccessFieldErrors={supportAccessFieldErrors}
              supportAccessEndForm={supportAccessEndForm}
              supportAccessEndSubmitState={supportAccessEndSubmitState}
              supportAccessEndFieldErrors={supportAccessEndFieldErrors}
              onSupportAccessChange={updateSupportAccessFormField}
              onSupportAccessSubmit={handleSupportAccessSubmit}
              onSupportAccessEndChange={updateSupportAccessEndFormField}
              onSupportAccessEndSubmit={handleSupportAccessEndSubmit}
              tenantExportForm={tenantExportForm}
              tenantExportSubmitState={tenantExportSubmitState}
              tenantExportFieldErrors={tenantExportFieldErrors}
              onTenantExportChange={updateTenantExportFormField}
              onTenantExportSubmit={handleTenantExportSubmit}
              tenantDeletionJobForm={tenantDeletionJobForm}
              tenantDeletionJobSubmitState={tenantDeletionJobSubmitState}
              tenantDeletionJobFieldErrors={tenantDeletionJobFieldErrors}
              onTenantDeletionJobChange={updateTenantDeletionJobFormField}
              onTenantDeletionJobSubmit={handleTenantDeletionJobSubmit}
            />
          ) : null}
        </>
      )}
    </AuthenticatedShell>
  );
}

function PlatformTenantDetailTabs({
  tenant,
  canUpdateSubscription,
  canStartSupportAccess,
  canQueueTenantExport,
  canQueueTenantDeletionJob,
  subscriptionForm,
  subscriptionSubmitState,
  subscriptionFieldErrors,
  onSubscriptionChange,
  onSubscriptionSubmit,
  readOnlyOverrideForm,
  readOnlyOverrideSubmitState,
  readOnlyOverrideFieldErrors,
  onReadOnlyOverrideChange,
  onReadOnlyOverrideSubmit,
  tenantSuspensionForm,
  tenantSuspensionSubmitState,
  tenantSuspensionFieldErrors,
  onTenantSuspensionChange,
  onTenantSuspensionSubmit,
  supportAccessForm,
  supportAccessSubmitState,
  supportAccessFieldErrors,
  supportAccessEndForm,
  supportAccessEndSubmitState,
  supportAccessEndFieldErrors,
  onSupportAccessChange,
  onSupportAccessSubmit,
  onSupportAccessEndChange,
  onSupportAccessEndSubmit,
  tenantExportForm,
  tenantExportSubmitState,
  tenantExportFieldErrors,
  onTenantExportChange,
  onTenantExportSubmit,
  tenantDeletionJobForm,
  tenantDeletionJobSubmitState,
  tenantDeletionJobFieldErrors,
  onTenantDeletionJobChange,
  onTenantDeletionJobSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly canStartSupportAccess: boolean;
  readonly canQueueTenantExport: boolean;
  readonly canQueueTenantDeletionJob: boolean;
  readonly subscriptionForm: PlatformTenantSubscriptionForm;
  readonly subscriptionSubmitState: PlatformTenantSubscriptionSubmitState;
  readonly subscriptionFieldErrors: Record<string, string>;
  readonly onSubscriptionChange: <K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) => void;
  readonly onSubscriptionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly readOnlyOverrideForm: PlatformTenantReadOnlyOverrideForm;
  readonly readOnlyOverrideSubmitState: PlatformTenantReadOnlyOverrideSubmitState;
  readonly readOnlyOverrideFieldErrors: Record<string, string>;
  readonly onReadOnlyOverrideChange: <K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) => void;
  readonly onReadOnlyOverrideSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantSuspensionForm: PlatformTenantSuspensionForm;
  readonly tenantSuspensionSubmitState: PlatformTenantSuspensionSubmitState;
  readonly tenantSuspensionFieldErrors: Record<string, string>;
  readonly onTenantSuspensionChange: <K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) => void;
  readonly onTenantSuspensionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly supportAccessForm: PlatformSupportAccessForm;
  readonly supportAccessSubmitState: PlatformSupportAccessSubmitState;
  readonly supportAccessFieldErrors: Record<string, string>;
  readonly supportAccessEndForm: PlatformSupportAccessEndForm;
  readonly supportAccessEndSubmitState: PlatformSupportAccessEndSubmitState;
  readonly supportAccessEndFieldErrors: Record<string, string>;
  readonly onSupportAccessChange: <K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) => void;
  readonly onSupportAccessSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onSupportAccessEndChange: <K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) => void;
  readonly onSupportAccessEndSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantExportForm: PlatformTenantExportForm;
  readonly tenantExportSubmitState: PlatformTenantExportSubmitState;
  readonly tenantExportFieldErrors: Record<string, string>;
  readonly onTenantExportChange: <K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) => void;
  readonly onTenantExportSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantDeletionJobForm: PlatformTenantDeletionJobForm;
  readonly tenantDeletionJobSubmitState: PlatformTenantDeletionJobSubmitState;
  readonly tenantDeletionJobFieldErrors: Record<string, string>;
  readonly onTenantDeletionJobChange: <K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) => void;
  readonly onTenantDeletionJobSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard
          title="Tenant status"
          value={formatTenantStatus(tenant.status)}
          description="Lifecycle access remains backend-authoritative."
        />
        <SummaryCard
          title="Plan"
          value={formatTenantPlan(tenant)}
          description={`Source: ${tenant.subscription?.status_source ?? 'Not returned'}`}
        />
        <SummaryCard
          title="Expiration"
          value={tenant.subscription?.expiration_date ?? 'Not returned'}
          description="Subscription lifecycle dates are interpreted by the backend."
        />
        <SummaryCard
          title="Onboarding"
          value={
            tenant.onboarding_completed_at === null || tenant.onboarding_completed_at === undefined
              ? 'Incomplete or not returned'
              : 'Completed'
          }
          description={tenant.onboarding_completed_at ?? 'Completion timestamp not returned'}
        />
      </div>

      <Tabs defaultValue="overview" id="tenant-detail-tabs" className="grid gap-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl border border-border bg-muted/40 p-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="support-access">Support Access</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
          <TabsTrigger value="deletion">Deletion</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Tenant metadata</CardTitle>
              <CardDescription>
                Platform-visible tenant identity and localization fields from the tenant detail API.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Tenant ID" value={tenant.id} />
              <KeyValue label="Business name" value={tenant.business_name} />
              <KeyValue label="Shop email" value={tenant.shop_email ?? 'Not returned'} />
              <KeyValue
                label="Timezone / Country / Currency"
                value={formatTenantLocation(tenant)}
              />
              <KeyValue label="Created" value={tenant.created_at ?? 'Not returned'} />
              <KeyValue label="Last updated" value={tenant.updated_at ?? 'Not returned'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription snapshot</CardTitle>
              <CardDescription>
                Current subscription summary returned by the platform tenant detail API.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue
                label="Plan ID"
                value={tenant.subscription?.plan_id ?? tenant.plan?.id ?? 'Not returned'}
              />
              <KeyValue label="Plan name" value={formatTenantPlan(tenant)} />
              <KeyValue
                label="Start date"
                value={tenant.subscription?.start_date ?? 'Not returned'}
              />
              <KeyValue
                label="Expiration date"
                value={tenant.subscription?.expiration_date ?? 'Not returned'}
              />
              <KeyValue
                label="Status source"
                value={tenant.subscription?.status_source ?? 'Not returned'}
              />
              <KeyValue
                label="Last renewal"
                value={tenant.subscription?.last_renewal_at ?? 'Not returned'}
              />
              <KeyValue
                label="Updated by platform admin"
                value={tenant.subscription?.updated_by_platform_admin_user_id ?? 'Not returned'}
              />
              <KeyValue
                label="Subscription updated"
                value={tenant.subscription?.updated_at ?? 'Not returned'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="grid gap-5">
          <PlatformTenantSubscriptionManagementPanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={subscriptionForm}
            submitState={subscriptionSubmitState}
            fieldErrors={subscriptionFieldErrors}
            onChange={onSubscriptionChange}
            onSubmit={onSubscriptionSubmit}
          />
        </TabsContent>

        <TabsContent value="support-access" className="grid gap-5">
          <PlatformTenantSupportAccessPanel
            tenant={tenant}
            canStartSupportAccess={canStartSupportAccess}
            form={supportAccessForm}
            submitState={supportAccessSubmitState}
            fieldErrors={supportAccessFieldErrors}
            endForm={supportAccessEndForm}
            endSubmitState={supportAccessEndSubmitState}
            endFieldErrors={supportAccessEndFieldErrors}
            onChange={onSupportAccessChange}
            onSubmit={onSupportAccessSubmit}
            onEndChange={onSupportAccessEndChange}
            onEndSubmit={onSupportAccessEndSubmit}
          />
        </TabsContent>

        <TabsContent value="exports" className="grid gap-5">
          <PlatformTenantExportPanel
            tenant={tenant}
            canQueueTenantExport={canQueueTenantExport}
            form={tenantExportForm}
            submitState={tenantExportSubmitState}
            fieldErrors={tenantExportFieldErrors}
            onChange={onTenantExportChange}
            onSubmit={onTenantExportSubmit}
          />
        </TabsContent>

        <TabsContent value="deletion" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Deletion readiness</CardTitle>
              <CardDescription>
                Read-only deletion lifecycle fields. Queueing is available below only when the
                backend confirms the tenant is pending deletion with a scheduled deletion timestamp.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
              <KeyValue
                label="Deletion scheduled for"
                value={tenant.deletion_scheduled_for ?? 'Not returned'}
              />
              <KeyValue label="Deleted at" value={tenant.deleted_at ?? 'Not returned'} />
              <KeyValue
                label="Required permission"
                value="platform.tenants.update plus backend eligibility"
              />
            </CardContent>
          </Card>

          <PlatformTenantDeletionJobPanel
            tenant={tenant}
            canQueueTenantDeletionJob={canQueueTenantDeletionJob}
            form={tenantDeletionJobForm}
            submitState={tenantDeletionJobSubmitState}
            fieldErrors={tenantDeletionJobFieldErrors}
            onChange={onTenantDeletionJobChange}
            onSubmit={onTenantDeletionJobSubmit}
          />
        </TabsContent>

        <TabsContent value="lifecycle" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle detail</CardTitle>
              <CardDescription>
                Read-only lifecycle fields used for platform operations and deletion safeguards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
              <KeyValue
                label="Onboarding completed"
                value={tenant.onboarding_completed_at ?? 'Not returned'}
              />
              <KeyValue
                label="Deletion scheduled for"
                value={tenant.deletion_scheduled_for ?? 'Not returned'}
              />
              <KeyValue label="Deleted at" value={tenant.deleted_at ?? 'Not returned'} />
            </CardContent>
          </Card>

          <PlatformTenantReadOnlyOverridePanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={readOnlyOverrideForm}
            submitState={readOnlyOverrideSubmitState}
            fieldErrors={readOnlyOverrideFieldErrors}
            onChange={onReadOnlyOverrideChange}
            onSubmit={onReadOnlyOverrideSubmit}
          />

          <PlatformTenantSuspensionPanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={tenantSuspensionForm}
            submitState={tenantSuspensionSubmitState}
            fieldErrors={tenantSuspensionFieldErrors}
            onChange={onTenantSuspensionChange}
            onSubmit={onTenantSuspensionSubmit}
          />
        </TabsContent>

        <TabsContent value="audit" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Audit placeholders</CardTitle>
              <CardDescription>
                Platform audit visibility remains planned until the audit-log API slice is wired.
                This tab documents placement without inventing audit data.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <PlannedWorkflowCard
                title="Platform audit log search planned"
                requiredPermission="platform.audit_logs.read"
                description="Platform audit log search should use the documented /platform/audit-logs route when the backend API is available."
              />
              <PlannedWorkflowCard
                title="Tenant lifecycle history planned"
                requiredPermission="platform.tenants.read"
                description="Lifecycle status history should show actor, timestamp, previous status, next status, and reason only after the backend exposes safe history fields."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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

function PlatformAuditLogResults({
  auditLogs,
}: {
  readonly auditLogs: readonly PlatformAuditLogListItem[];
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:hidden">
        {auditLogs.map((auditLog) => (
          <PlatformAuditLogMobileCard key={auditLog.id} auditLog={auditLog} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((auditLog) => (
              <TableRow key={auditLog.id}>
                <TableCell>
                  <p className="font-bold text-foreground">{auditLog.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">ID: {auditLog.id}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {auditLog.platform_admin_user_id ?? 'System / not returned'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {auditLog.tenant_id ?? 'Platform-level'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {auditLog.entity_type}
                  {auditLog.entity_id === null ? '' : ` · ${auditLog.entity_id}`}
                </TableCell>
                <TableCell className="text-muted-foreground">{auditLog.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PlatformAuditLogMobileCard({ auditLog }: { readonly auditLog: PlatformAuditLogListItem }) {
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{auditLog.entity_type}</Badge>
        <Badge variant="info">Platform audit</Badge>
      </div>

      <div>
        <h2 className="break-words font-bold text-foreground">{auditLog.action}</h2>
        <p className="mt-1 break-words text-sm text-muted-foreground">{auditLog.created_at}</p>
      </div>

      <dl className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <div>
          <dt className="font-bold text-foreground">Actor admin</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.platform_admin_user_id ?? 'System / not returned'}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Tenant</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.tenant_id ?? 'Platform-level'}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Entity</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.entity_type}
            {auditLog.entity_id === null ? '' : ` · ${auditLog.entity_id}`}
          </dd>
        </div>
      </dl>
    </article>
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
              <TableHead>Location</TableHead>
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
                    {formatTenantLocation(tenant)}
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
      </dl>

      <ButtonLink href={tenantDetailHref} variant="secondary" size="sm">
        View tenant
      </ButtonLink>
    </article>
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

function PlatformTenantSupportAccessPanel({
  tenant,
  canStartSupportAccess,
  form,
  submitState,
  fieldErrors,
  endForm,
  endSubmitState,
  endFieldErrors,
  onChange,
  onSubmit,
  onEndChange,
  onEndSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canStartSupportAccess: boolean;
  readonly form: PlatformSupportAccessForm;
  readonly submitState: PlatformSupportAccessSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly endForm: PlatformSupportAccessEndForm;
  readonly endSubmitState: PlatformSupportAccessEndSubmitState;
  readonly endFieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onEndChange: <K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) => void;
  readonly onEndSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isEnding = endSubmitState.status === 'submitting';
  const isWriteAllowed = form.mode === 'write_allowed';
  const visibleSupportAccessState = submitState.status === 'success' ? submitState : null;
  const visibleSupportAccessSession = visibleSupportAccessState?.session ?? null;
  const visibleSupportAccessMessage = visibleSupportAccessState?.message ?? null;
  const canEndVisibleSession = visibleSupportAccessSession?.ended_at === null;

  return (
    <Card id="tenant-support-access">
      <CardHeader>
        <CardTitle>Support access</CardTitle>
        <CardDescription>
          Start an audited platform support access session for this tenant. This does not silently
          impersonate a tenant user and does not enter the tenant workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue label="Default mode" value="Read-only" />
        </div>

        {!canStartSupportAccess ? (
          <Alert>
            <p className="text-sm font-bold">Support access unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot start support access.
              Required permission: <strong>platform.support_access</strong>.
            </p>
          </Alert>
        ) : null}

        {visibleSupportAccessSession !== null ? (
          <Alert>
            <p className="text-sm font-bold">
              {visibleSupportAccessSession.ended_at === null
                ? 'Visible support access marker'
                : 'Support access session ended'}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {visibleSupportAccessMessage}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Session ID" value={visibleSupportAccessSession.id} />
              <KeyValue
                label="Mode"
                value={formatSupportAccessMode(visibleSupportAccessSession.mode)}
              />
              <KeyValue label="Started" value={visibleSupportAccessSession.started_at} />
              <KeyValue label="Expires" value={visibleSupportAccessSession.expires_at} />
              <KeyValue label="Ended" value={visibleSupportAccessSession.ended_at ?? 'Active'} />
            </div>
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

        {isWriteAllowed ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Write-allowed support access selected</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This mode must be explicit and should be used only when support, investigation,
              compliance, or recovery work requires it. Backend authorization and audit logging
              remain authoritative.
            </p>
          </Alert>
        ) : null}

        {endSubmitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Support access ended</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{endSubmitState.message}</p>
          </Alert>
        ) : null}

        {endSubmitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{endSubmitState.message}</p>
            {endSubmitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {endSubmitState.detail}
              </p>
            )}
          </Alert>
        ) : null}

        {visibleSupportAccessSession !== null ? (
          <form className="grid gap-5" onSubmit={onEndSubmit}>
            <fieldset
              className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
              disabled={!canStartSupportAccess || !canEndVisibleSession || isEnding}
            >
              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">End current support access</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    End the currently visible support access session when support, investigation,
                    compliance, or recovery work is complete. A reason is required for auditability.
                  </p>
                </div>

                {!canEndVisibleSession ? (
                  <Alert>
                    <p className="text-sm font-bold">Session is not active</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      This support access session has already ended or is no longer available from
                      this screen.
                    </p>
                  </Alert>
                ) : null}

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">End reason</span>
                  <textarea
                    value={endForm.reason}
                    onChange={(event) => onEndChange('reason', event.currentTarget.value)}
                    required
                    maxLength={500}
                    rows={3}
                    className="min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Example: Support investigation completed."
                  />
                  <FieldError message={endFieldErrors.reason} />
                </label>
              </section>
            </fieldset>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                variant="destructive"
                disabled={!canStartSupportAccess || !canEndVisibleSession || isEnding}
              >
                {isEnding ? 'Ending support access...' : 'End support access'}
              </Button>
            </div>
          </form>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canStartSupportAccess || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Support access fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Reason, mode, and expiration are required. Read-only is the default mode.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Mode</span>
                <select
                  value={form.mode}
                  onChange={(event) =>
                    onChange('mode', event.currentTarget.value as PlatformSupportAccessMode)
                  }
                  required
                  className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="read_only">Read-only</option>
                  <option value="write_allowed">Write-allowed</option>
                </select>
                <FieldError message={fieldErrors.mode} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: Investigate support ticket without tenant impersonation."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Expiration</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                  required
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Required. The frontend sends this to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant={isWriteAllowed ? 'destructive' : 'primary'}
              disabled={!canStartSupportAccess || isSubmitting}
            >
              {isSubmitting ? 'Starting support access...' : 'Start support access'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantExportPanel({
  tenant,
  canQueueTenantExport,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canQueueTenantExport: boolean;
  readonly form: PlatformTenantExportForm;
  readonly submitState: PlatformTenantExportSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isLifecycleBlocked = tenant.status === 'pending_deletion' || tenant.status === 'deleted';
  const isSubmitDisabled = !canQueueTenantExport || isSubmitting || isLifecycleBlocked;

  return (
    <Card id="tenant-export">
      <CardHeader>
        <CardTitle>Tenant export</CardTitle>
        <CardDescription>
          Queue an audited async tenant export job. This slice creates the background job; the
          export worker, ZIP package, signed download URL, and manifest validation remain separate
          slices.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue label="Required permission" value="platform.tenants.update" />
        </div>

        {!canQueueTenantExport ? (
          <Alert>
            <p className="text-sm font-bold">Tenant export unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot queue tenant exports.
              Required permission: <strong>platform.tenants.update</strong>.
            </p>
          </Alert>
        ) : null}

        {isLifecycleBlocked ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Tenant export blocked by lifecycle state</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Export jobs are not queued for deleted tenants or tenants pending deletion in this
              slice. Emergency-extension behavior belongs to the later deletion/export lifecycle
              hardening slice.
            </p>
          </Alert>
        ) : null}

        {form.include_attachments ? (
          <Alert>
            <p className="text-sm font-bold">Attachment binaries requested</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The queued job records this option for the future export worker. Actual attachment
              packaging remains blocked until the files/object-storage export slice is implemented.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant export queued</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Job ID" value={submitState.job.id} />
              <KeyValue label="Status" value={submitState.job.status} />
              <KeyValue label="Job type" value={submitState.job.job_type} />
              <KeyValue label="Run after" value={submitState.job.run_after} />
            </div>
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
            disabled={isSubmitDisabled}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Export request fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A reason is required for auditability. The export job is queued asynchronously and
                  does not generate a download link in this slice.
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
                  placeholder="Example: Tenant requested a full data export for account review."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <input
                  type="checkbox"
                  checked={form.include_attachments}
                  onChange={(event) => onChange('include_attachments', event.currentTarget.checked)}
                  className="mt-1 h-5 w-5 rounded border border-input"
                />
                <span>
                  <span className="block text-sm font-bold text-foreground">
                    Request attachment binaries
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    Records the attachment-binary option for the future export worker. Metadata-only
                    export is used when this is unchecked.
                  </span>
                </span>
              </label>
              <FieldError message={fieldErrors.include_attachments} />
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Queueing tenant export...' : 'Queue tenant export'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantDeletionJobPanel({
  tenant,
  canQueueTenantDeletionJob,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canQueueTenantDeletionJob: boolean;
  readonly form: PlatformTenantDeletionJobForm;
  readonly submitState: PlatformTenantDeletionJobSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isEligible =
    tenant.status === 'pending_deletion' &&
    tenant.deletion_scheduled_for !== null &&
    tenant.deletion_scheduled_for !== undefined;
  const expectedConfirmation = tenant.business_name;
  const confirmationValue = form.confirmation.trim();
  const hasConfirmation = confirmationValue === expectedConfirmation;
  const isFormDisabled = !canQueueTenantDeletionJob || isSubmitting || !isEligible;
  const isSubmitDisabled = isFormDisabled || !hasConfirmation;

  return (
    <Card id="tenant-deletion-job">
      <CardHeader>
        <CardTitle>Tenant deletion job</CardTitle>
        <CardDescription>
          Queue an audited tenant deletion job only after the tenant is in pending deletion and has
          a deletion scheduled date. Permanent deletion execution remains a worker-controlled
          lifecycle step.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Deletion scheduled for"
            value={tenant.deletion_scheduled_for ?? 'Not scheduled'}
          />
        </div>

        {!canQueueTenantDeletionJob ? (
          <Alert>
            <p className="text-sm font-bold">Tenant deletion job unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot queue deletion jobs.
              Required permission: <strong>platform.tenants.update</strong>.
            </p>
          </Alert>
        ) : null}

        {!isEligible ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Tenant deletion job blocked</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Deletion jobs can be queued only for tenants in <strong>pending_deletion</strong> with
              a populated <strong>deletion_scheduled_for</strong> timestamp. Active, grace-period,
              read-only, suspended, and deleted tenants are blocked.
            </p>
          </Alert>
        ) : null}

        {isEligible ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Deletion job confirmation required</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Queueing a deletion job is a high-risk platform workflow. Type the tenant business
              name exactly before submitting: <strong>{expectedConfirmation}</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant deletion job queued</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Deletion job ID" value={submitState.job.id} />
              <KeyValue label="Status" value={submitState.job.status} />
              <KeyValue label="Scheduled for" value={submitState.job.scheduled_for} />
              <KeyValue label="Queued at" value={submitState.job.created_at} />
            </div>
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
            disabled={isFormDisabled}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Deletion queue fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A reason is required for auditability. This does not execute permanent deletion
                  immediately.
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
                  placeholder="Example: Retention window completed and tenant is eligible for deletion."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">
                  Confirm tenant business name
                </span>
                <Input
                  value={form.confirmation}
                  onChange={(event) => onChange('confirmation', event.currentTarget.value)}
                  required
                  placeholder={expectedConfirmation}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Type <strong>{expectedConfirmation}</strong> exactly to enable deletion job
                  queueing.
                </p>
                {confirmationValue.length > 0 && !hasConfirmation ? (
                  <p className="text-sm font-semibold text-destructive">
                    Confirmation does not match the tenant business name.
                  </p>
                ) : null}
                <FieldError message={fieldErrors.confirmation} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="submit" variant="destructive" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Queueing deletion job...' : 'Queue deletion job'}
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

function PlannedWorkflowCard({
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">Planned</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <KeyValue label="Required permission" value={requiredPermission} />
        {detail === null ? null : (
          <Alert>
            <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function hasEffectivePermission(session: AuthSessionResponseData, permission: string): boolean {
  return session.effective_permissions.includes(permission);
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
            <Alert>
              <p className="text-sm font-bold">Platform admin context</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tenant support access is not active in this shell. Tenant troubleshooting must use
                explicit audited support access and must never behave as silent impersonation.
              </p>
            </Alert>

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

function formatSupportAccessMode(mode: string): string {
  return mode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
