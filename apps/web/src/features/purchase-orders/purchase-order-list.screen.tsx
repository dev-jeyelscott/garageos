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
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { PurchaseOrderListResults } from './components/purchase-order-list-results';
import { getPurchaseOrders } from './purchase-order.api';
import {
  defaultPurchaseOrderListFilters,
  purchaseOrderListPageSize,
  purchaseOrderStatusFilterOptions,
} from './purchase-order.defaults';
import type {
  PurchaseOrderBranchFilter,
  PurchaseOrderListFilters,
  PurchaseOrderListState,
  PurchaseOrderStatusFilter,
} from './purchase-order.types';
import {
  canUsePurchaseWriteActions,
  canViewPurchaseOrders,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './purchase-order.ui';

export function PurchaseOrderListScreen() {
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [searchDraft, setSearchDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<PurchaseOrderStatusFilter>('all');
  const [branchDraft, setBranchDraft] = useState<PurchaseOrderBranchFilter>('all');
  const [fromDateDraft, setFromDateDraft] = useState('');
  const [toDateDraft, setToDateDraft] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<PurchaseOrderListFilters>(
    defaultPurchaseOrderListFilters,
  );
  const [purchaseOrderListState, setPurchaseOrderListState] = useState<PurchaseOrderListState>({
    status: 'idle',
    purchaseOrders: [],
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
  const canReadPurchaseOrders = hasPermission(session, 'purchases.read');
  const canCreatePurchaseOrders = hasPermission(session, 'purchases.create');
  const canAccessPurchaseOrders = canViewPurchaseOrders(session);
  const writeActionsAllowed = canUsePurchaseWriteActions({ session, networkStatus });

  useEffect(() => {
    if (!canAccessPurchaseOrders) {
      return;
    }

    if (networkStatus === 'offline') {
      setPurchaseOrderListState((current) => ({
        status: 'error',
        purchaseOrders: current.purchaseOrders,
        pagination: current.pagination,
        message: 'Purchase order search is unavailable while offline.',
        detail: 'Offline mode is read-only. Reconnect to refresh purchase order search results.',
        code: 'offline_read_only',
      }));
      return;
    }

    let active = true;

    async function loadInitialPurchaseOrders() {
      setPurchaseOrderListState({
        status: 'loading',
        purchaseOrders: [],
        pagination: null,
      });

      try {
        const result = await getPurchaseOrders({
          filters: appliedFilters,
          limit: purchaseOrderListPageSize,
        });

        if (!active) {
          return;
        }

        setPurchaseOrderListState({
          status: 'loaded',
          purchaseOrders: result.purchaseOrders,
          pagination: result.pagination,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setPurchaseOrderListState({
          status: 'error',
          purchaseOrders: [],
          pagination: null,
          message: toSafeErrorMessage(error, 'Unable to load purchase orders.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadInitialPurchaseOrders();

    return () => {
      active = false;
    };
  }, [appliedFilters, canAccessPurchaseOrders, networkStatus]);

  const handleLoadMore = useCallback(async () => {
    const nextCursor = purchaseOrderListState.pagination?.next_cursor ?? null;

    if (
      nextCursor === null ||
      purchaseOrderListState.status === 'loading_more' ||
      networkStatus === 'offline'
    ) {
      return;
    }

    setPurchaseOrderListState((current) => ({
      ...current,
      status: 'loading_more',
    }));

    try {
      const result = await getPurchaseOrders({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: purchaseOrderListPageSize,
      });

      setPurchaseOrderListState((current) => ({
        status: 'loaded',
        purchaseOrders: [...current.purchaseOrders, ...result.purchaseOrders],
        pagination: result.pagination,
      }));
    } catch (error) {
      setPurchaseOrderListState((current) => ({
        status: 'error',
        purchaseOrders: current.purchaseOrders,
        pagination: current.pagination,
        message: toSafeErrorMessage(error, 'Unable to load more purchase orders.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      }));
    }
  }, [
    appliedFilters,
    networkStatus,
    purchaseOrderListState.pagination?.next_cursor,
    purchaseOrderListState.status,
  ]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      q: searchDraft.trim(),
      status: statusDraft,
      branch_id: branchDraft,
      from_date: fromDateDraft,
      to_date: toDateDraft,
    });
  }

  function handleResetFilters() {
    setSearchDraft('');
    setStatusDraft('all');
    setBranchDraft('all');
    setFromDateDraft('');
    setToDateDraft('');
    setAppliedFilters(defaultPurchaseOrderListFilters);
  }

  const isInitialLoading =
    sessionState.status === 'loading' ||
    (canAccessPurchaseOrders &&
      (purchaseOrderListState.status === 'idle' || purchaseOrderListState.status === 'loading'));
  const isLoadingMore = purchaseOrderListState.status === 'loading_more';
  const hasMore =
    purchaseOrderListState.pagination?.has_more === true &&
    purchaseOrderListState.pagination.next_cursor !== null;
  const hasActiveFilters =
    appliedFilters.q.length > 0 ||
    appliedFilters.status !== 'all' ||
    appliedFilters.branch_id !== 'all' ||
    appliedFilters.from_date.length > 0 ||
    appliedFilters.to_date.length > 0;
  const branchOptions = session?.branches ?? [];
  const shouldShowBranchFilter =
    session?.tenant_wide_branch_access === true || branchOptions.length > 1;

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

  if (session !== null && !canReadPurchaseOrders) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Purchase order list unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view purchase orders.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>purchases.read</strong>
        </p>
      </Alert>
    );
  }

  if (session !== null && session.access.can_access_operational_modules !== true) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Purchase orders are blocked</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This tenant lifecycle state cannot access operational purchase order screens. Complete
          setup, renew, or contact a platform admin before opening purchasing records.
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
              Purchasing and accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">Purchase orders</CardTitle>
            <CardDescription className="mt-2">
              Search and filter branch-scoped purchase orders using the documented purchasing API.
            </CardDescription>
          </div>
          <Button
            type="button"
            disabled
            title={
              canCreatePurchaseOrders && writeActionsAllowed
                ? 'Purchase order create UI is planned for a later Milestone 8 slice.'
                : 'Create purchase order is blocked by permission, read-only tenant state, offline mode, or this slice scope.'
            }
          >
            New purchase order
          </Button>
        </CardHeader>
      </Card>

      {networkStatus === 'offline' ? (
        <Alert>
          <p className="text-sm leading-6">
            Offline mode is read-only. Reconnect before refreshing purchase order search results.
          </p>
        </Alert>
      ) : null}

      {session?.access.read_only === true ? (
        <Alert>
          <p className="text-sm leading-6">
            This tenant is read-only. Purchase order viewing and search remain available with{' '}
            <strong>purchases.read</strong>, but purchasing writes are blocked.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Purchase order list</CardTitle>
          <CardDescription>
            Filter by purchase order number or supplier text, branch, documented status, and order
            date range. Results remain scoped by the authenticated tenant session and branch access.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="grid gap-3 xl:grid-cols-[1fr_13rem_13rem_11rem_11rem_auto_auto] xl:items-end"
            onSubmit={handleFilterSubmit}
          >
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Search purchase orders</span>
              <Input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.currentTarget.value)}
                placeholder="PO number or supplier text..."
                disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Status</span>
              <select
                value={statusDraft}
                onChange={(event) =>
                  setStatusDraft(event.currentTarget.value as PurchaseOrderStatusFilter)
                }
                disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {purchaseOrderStatusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Branch</span>
              <select
                value={branchDraft}
                onChange={(event) => setBranchDraft(event.currentTarget.value)}
                disabled={
                  isInitialLoading ||
                  isLoadingMore ||
                  networkStatus === 'offline' ||
                  !shouldShowBranchFilter
                }
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="all">All accessible branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">From date</span>
              <Input
                type="date"
                value={fromDateDraft}
                onChange={(event) => setFromDateDraft(event.currentTarget.value)}
                disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">To date</span>
              <Input
                type="date"
                value={toDateDraft}
                onChange={(event) => setToDateDraft(event.currentTarget.value)}
                disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
              />
            </label>

            <Button
              type="submit"
              disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
            >
              Apply filters
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isInitialLoading || isLoadingMore || networkStatus === 'offline'}
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </form>

          {hasActiveFilters ? (
            <Alert>
              <p className="text-sm leading-6">
                Active filters:{' '}
                <strong>{formatAppliedFilters(appliedFilters, branchOptions)}</strong>
              </p>
            </Alert>
          ) : null}

          <PurchaseOrderListResults
            purchaseOrderListState={purchaseOrderListState}
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

function formatAppliedFilters(
  filters: PurchaseOrderListFilters,
  branches: readonly { readonly id: string; readonly name: string }[],
): string {
  const parts = [
    filters.q.length > 0 ? filters.q : 'No search',
    formatStatusFilter(filters.status),
    formatBranchFilter(filters.branch_id, branches),
    filters.from_date.length > 0 ? `From ${filters.from_date}` : null,
    filters.to_date.length > 0 ? `To ${filters.to_date}` : null,
  ].filter((part): part is string => part !== null);

  return parts.join(' · ');
}

function formatBranchFilter(
  branchId: PurchaseOrderBranchFilter,
  branches: readonly { readonly id: string; readonly name: string }[],
): string {
  if (branchId === 'all') {
    return 'All accessible branches';
  }

  return branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch';
}

function formatStatusFilter(status: PurchaseOrderStatusFilter): string {
  if (status === 'all') {
    return 'All statuses';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
