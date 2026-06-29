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
  Skeleton,
} from '../../../components/ui';
import { isApiClientError } from '../../../lib/api-envelope';

import { PlatformAuditLogResults } from './components/platform-audit-log-results';
import { getPlatformAuditLogs } from './platform-audit-log.api';
import {
  defaultPlatformAuditLogListFilters,
  platformAuditLogListPageSize,
} from './platform-audit-log.defaults';
import type {
  PlatformAuditLogListFilters,
  PlatformAuditLogListState,
} from './platform-audit-log.types';

export function PlatformAuditLogsContent({
  canReadAuditLogs,
}: {
  readonly canReadAuditLogs: boolean;
}) {
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

  useEffect(() => {
    if (!canReadAuditLogs) {
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
  }, [appliedFilters, canReadAuditLogs]);

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

  const isInitialLoading = auditLogState.status === 'idle' || auditLogState.status === 'loading';
  const isLoadingMore = auditLogState.status === 'loading_more';
  const hasMore =
    auditLogState.pagination?.has_more === true && auditLogState.pagination.next_cursor !== null;
  const hasActiveFilters = Object.values(appliedFilters).some((value) => value.length > 0);

  if (!canReadAuditLogs) {
    return (
      <PlatformAuditLogForbiddenState
        title="Platform audit logs unavailable"
        requiredPermission="platform.audit_logs.read"
        description="Your platform session does not include permission to view platform audit logs."
      />
    );
  }

  return (
    <>
      <Alert>
        <p className="text-sm leading-6">
          This is a read-only platform audit search screen. It uses actor, action, tenant, and date
          filters only. Sensitive metadata is redacted by the backend response.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Audit log search</CardTitle>
          <CardDescription>
            Use narrow filters for high-volume audit trails. Results use cursor pagination from the
            platform audit log API.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          <form className="grid gap-3 lg:grid-cols-5 lg:items-end" onSubmit={handleFilterSubmit}>
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

          {isInitialLoading ? <PlatformAuditLogListSkeleton /> : null}

          {auditLogState.status === 'error' ? (
            auditLogState.code === 'forbidden' ? (
              <PlatformAuditLogForbiddenState
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
            <PlatformAuditLogEmptyState
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
  );
}

function PlatformAuditLogForbiddenState({
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

function PlatformAuditLogEmptyState({
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

function PlatformAuditLogListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
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
