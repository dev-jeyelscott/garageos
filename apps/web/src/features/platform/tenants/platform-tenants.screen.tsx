'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../../../components/ui';
import { isApiClientError } from '../../../lib/api-envelope';
import { getPlatformTenants } from './platform-tenant.api';
import {
  defaultPlatformTenantListFilters,
  platformTenantListPageSize,
  tenantStatusFilterOptions,
} from './platform-tenant.defaults';
import {
  PlatformTenantResults,
  PlatformTenantForbiddenState,
} from './components/platform-tenant-results';
import type {
  PlatformTenantListFilters,
  PlatformTenantListState,
  PlatformTenantStatusFilter,
} from './platform-tenant.types';

interface PlatformTenantsContentProps {
  readonly canReadTenantList: boolean;
}

export function PlatformTenantsContent({ canReadTenantList }: PlatformTenantsContentProps) {
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

  useEffect(() => {
    if (!canReadTenantList) {
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
  }, [appliedFilters, canReadTenantList]);

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

  const isInitialLoading =
    tenantListState.status === 'idle' || tenantListState.status === 'loading';
  const isLoadingMore = tenantListState.status === 'loading_more';
  const hasMore =
    tenantListState.pagination?.has_more === true &&
    tenantListState.pagination.next_cursor !== null;
  const hasActiveFilters = appliedFilters.q.length > 0 || appliedFilters.status !== 'all';

  if (!canReadTenantList) {
    return (
      <PlatformTenantForbiddenState
        title="Platform tenant list unavailable"
        requiredPermission="platform.tenants.read"
        description="Your platform session does not include permission to view tenant records."
      />
    );
  }

  return (
    <>
      <Alert>
        <p className="text-sm leading-6">
          This screen reads the documented platform tenant list only. Tenant creation, subscription
          overrides, support access, exports, deletion jobs, and audit logs remain separate
          documented workflows.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Tenant list</CardTitle>
          <CardDescription>
            Search and filter tenants through the platform list API. Cursor pagination is read from
            the API response metadata.
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

          <PlatformTenantResults
            tenantListState={tenantListState}
            isInitialLoading={isInitialLoading}
            isLoadingMore={isLoadingMore}
            hasActiveFilters={hasActiveFilters}
            hasMore={hasMore}
            onLoadMore={() => void handleLoadMore()}
          />
        </CardContent>
      </Card>
    </>
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

function getApiErrorCode(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  return error.code;
}

function formatTenantStatusFilter(status: PlatformTenantStatusFilter): string {
  if (status === 'all') {
    return 'All statuses';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
