'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../../components/ui';
import { isApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { SupplierListResults } from './components/supplier-list-results';
import { getSuppliers } from './supplier.api';
import {
  defaultSupplierListFilters,
  supplierListPageSize,
  supplierStatusFilterOptions,
} from './supplier.defaults';
import type {
  SupplierListFilters,
  SupplierListState,
  SupplierStatusFilter,
} from './supplier.types';

export function SupplierListScreen() {
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<SupplierStatusFilter>('all');
  const [appliedFilters, setAppliedFilters] = useState<SupplierListFilters>(
    defaultSupplierListFilters,
  );
  const [supplierListState, setSupplierListState] = useState<SupplierListState>({
    status: 'idle',
    suppliers: [],
    pagination: null,
  });
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setSessionState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (!active) {
          return;
        }

        setSessionState({ status: 'ready', session });
      } catch (error) {
        if (!active) {
          return;
        }

        setSessionState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const session = sessionState.status === 'ready' ? sessionState.session : null;
  const canReadSuppliers = session?.effective_permissions.includes('suppliers.read') === true;
  const canCreateSuppliers = session?.effective_permissions.includes('suppliers.create') === true;
  const canUseWriteActions =
    canCreateSuppliers && session?.access.read_only !== true && networkStatus === 'online';

  useEffect(() => {
    if (!canReadSuppliers) {
      return;
    }

    let active = true;

    async function loadInitialSuppliers() {
      setSupplierListState({
        status: 'loading',
        suppliers: [],
        pagination: null,
      });

      try {
        const result = await getSuppliers({
          filters: appliedFilters,
          limit: supplierListPageSize,
        });

        if (!active) {
          return;
        }

        setSupplierListState({
          status: 'loaded',
          suppliers: result.suppliers,
          pagination: result.pagination,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setSupplierListState({
          status: 'error',
          suppliers: [],
          pagination: null,
          message: toSafeErrorMessage(error, 'Unable to load suppliers.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadInitialSuppliers();

    return () => {
      active = false;
    };
  }, [appliedFilters, canReadSuppliers]);

  const handleLoadMore = useCallback(async () => {
    const nextCursor = supplierListState.pagination?.next_cursor ?? null;

    if (nextCursor === null || supplierListState.status === 'loading_more') {
      return;
    }

    setSupplierListState((current) => ({
      ...current,
      status: 'loading_more',
    }));

    try {
      const result = await getSuppliers({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: supplierListPageSize,
      });

      setSupplierListState((current) => ({
        status: 'loaded',
        suppliers: [...current.suppliers, ...result.suppliers],
        pagination: result.pagination,
      }));
    } catch (error) {
      setSupplierListState((current) => ({
        status: 'error',
        suppliers: current.suppliers,
        pagination: current.pagination,
        message: toSafeErrorMessage(error, 'Unable to load more suppliers.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      }));
    }
  }, [appliedFilters, supplierListState.pagination?.next_cursor, supplierListState.status]);

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
    setAppliedFilters(defaultSupplierListFilters);
  }

  const isInitialLoading =
    sessionState.status === 'loading' ||
    supplierListState.status === 'idle' ||
    supplierListState.status === 'loading';
  const isLoadingMore = supplierListState.status === 'loading_more';
  const hasMore =
    supplierListState.pagination?.has_more === true &&
    supplierListState.pagination.next_cursor !== null;
  const hasActiveFilters = appliedFilters.q.length > 0 || appliedFilters.status !== 'all';

  if (sessionState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{sessionState.message}</p>
        {sessionState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{sessionState.detail}</p>
        )}
      </Alert>
    );
  }

  if (session !== null && !canReadSuppliers) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier list unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view supplier records.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>suppliers.read</strong>
        </p>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and suppliers
            </p>
            <CardTitle className="mt-2 text-2xl">Suppliers</CardTitle>
            <CardDescription className="mt-2">
              Search and review tenant-wide supplier records through the documented supplier list
              API.
            </CardDescription>
          </div>
          <Button
            type="button"
            disabled
            title={
              canUseWriteActions
                ? 'Create supplier is planned for the next supplier UI slice.'
                : 'Create supplier is blocked by permission, read-only tenant state, or offline mode.'
            }
          >
            New supplier planned
          </Button>
        </CardHeader>
      </Card>

      <Alert>
        <p className="text-sm leading-6">
          This slice wires supplier list/search only. Create, edit, deactivate, reactivate, payment,
          credit, AP balance, and supplier-return workflows remain disabled until their documented
          API slices are implemented and validated.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Supplier list</CardTitle>
          <CardDescription>
            Filter by supplier name/contact text and supplier status. Results stay tenant-scoped by
            the authenticated API session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="grid gap-3 lg:grid-cols-[1fr_16rem_auto_auto] lg:items-end"
            onSubmit={handleFilterSubmit}
          >
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Search suppliers</span>
              <Input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.currentTarget.value)}
                placeholder="Supplier name, contact, mobile, email..."
                disabled={isInitialLoading || isLoadingMore}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Status</span>
              <select
                value={statusDraft}
                onChange={(event) =>
                  setStatusDraft(event.currentTarget.value as SupplierStatusFilter)
                }
                disabled={isInitialLoading || isLoadingMore}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {supplierStatusFilterOptions.map((option) => (
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
                <strong>{formatStatusFilter(appliedFilters.status)}</strong>
              </p>
            </Alert>
          ) : null}

          <SupplierListResults
            supplierListState={supplierListState}
            isInitialLoading={isInitialLoading}
            isLoadingMore={isLoadingMore}
            hasActiveFilters={hasActiveFilters}
            hasMore={hasMore}
            onLoadMore={() => void handleLoadMore()}
          />
        </CardContent>
      </Card>
    </div>
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

function formatStatusFilter(status: SupplierStatusFilter): string {
  if (status === 'all') {
    return 'All suppliers';
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)} suppliers`;
}

function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const identifiers = [
    error.requestId === null ? null : `request ${error.requestId}`,
    error.correlationId === null ? null : `correlation ${error.correlationId}`,
  ].filter((value): value is string => value !== null);

  return identifiers.length > 0 ? `Reference: ${identifiers.join(' · ')}` : null;
}

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}
